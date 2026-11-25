import type { Battery } from "./batteries";
import { listBatteries } from "./batteries.server";
import {
  type CurtailInput,
  type PvArraySnapshot,
  type PvBatterySnapshot,
  planCurtailment,
} from "./curtail";
import type { CurtailmentConfig } from "./curtailment";
import { readCurtailmentConfig } from "./curtailment-config.server";
import type { DiagnosticsLevel, DiagnosticsOrigin } from "./diagnostics";
import { appendDiagnostic } from "./diagnostics.server";
import { type Grid, isGridConfigured } from "./grid";
import { readGrid } from "./grid.server";
import { onHaChange } from "./ha-live.server";
import { cachedPrices, PRICE_SLOT_MS } from "./price-source.server";
import type { PriceConfig } from "./prices";
import { readPriceConfig } from "./prices.server";
import { isCurtailable, type PvEntity, pvSlug } from "./pv-entities";
import { listPvEntities } from "./pv-entities.server";
import {
  anyNotInForce,
  describePvLimitPublishes,
  forgetPublishedLimit,
  forgetPublishedLimits,
  isIgnoringItsLimit,
  publishPvLimits,
} from "./pv-limits.server";
import { toBoolean, toNumber } from "./readings.server";
import { readingAge, readStates } from "./states.server";

/**
 * How often a tick happens when nothing at all is moving.
 *
 * Ticks are driven by Home Assistant now, so a house doing nothing produces no
 * events and would otherwise produce no ticks — which is indistinguishable, from
 * the outside, from a loop that has died. This is what keeps `lastTickAt` and
 * the diagnostics log honest. It reads memory and costs nothing.
 */
const IDLE_TICK_MS = 60_000;

/**
 * The shortest gap between two ticks. Ticks follow Home Assistant's changes, so
 * this is a rate limit rather than a schedule: fast enough to follow a kettle,
 * slow enough not to hammer HA with a meter that reports every second. Not a
 * setting, because `settleSeconds` is what paces how often curtailment actually
 * moves; `CONTROL_MIN_TICK_MS` overrides it only so a test can reach it in
 * milliseconds.
 */
const minTickMs = () => Number(process.env.CONTROL_MIN_TICK_MS) || 5_000;

type LoopState = {
  /** The idle heartbeat. Its presence is also what "the loop is running" means. */
  timer: ReturnType<typeof setInterval> | null;
  /** Unsubscribes from Home Assistant's changes; null when the loop is stopped. */
  unsubscribe: (() => void) | null;
  curtailment: CurtailmentConfig | null;
  /** The tick currently awaiting Home Assistant, if any. Doubles as the overlap guard. */
  inFlight: Promise<void> | null;
  lastTickAt: string | null;
  /** When the last tick started, for the rate limit — monotonic-ish, not for display. */
  lastTickStartedAt: number | null;
  /** Set when changes arrived too soon after a tick and one is owed. */
  trailing: ReturnType<typeof setTimeout> | null;
  /** The entities whose changes should provoke a tick. */
  watched: Set<string>;
  /**
   * When the meter first went off curtailment's target, in epoch ms, or null
   * when it is on target.
   *
   * The settle rule needs to know how long something has been true, and
   * `curtail.ts` is pure — so the clock lives here and the elapsed time is
   * passed in. Reset the moment the meter comes back on target, which is what
   * makes the wait start again rather than accumulate across unrelated
   * excursions, and **restarted again whenever a limit actually moves**, which
   * is what stops the loop measuring its own correction before it has landed.
   */
  offTargetSinceMs: number | null;
};

const state: LoopState = {
  timer: null,
  unsubscribe: null,
  curtailment: null,
  inFlight: null,
  lastTickAt: null,
  lastTickStartedAt: null,
  trailing: null,
  watched: new Set(),
  offTargetSinceMs: null,
};

function log(
  origin: DiagnosticsOrigin,
  level: DiagnosticsLevel,
  message: string,
): void {
  appendDiagnostic(origin, level, message);
}

function logLoop(level: DiagnosticsLevel, message: string): void {
  log("pv-curtailment", level, message);
}

/** The stored configuration a tick's entity lists and its snapshots share. */
type TickConfig = {
  grid: Grid;
  batteries: Battery[];
  pvEntities: PvEntity[];
  prices: PriceConfig;
  curtailment: CurtailmentConfig;
};

async function readTickConfig(): Promise<TickConfig> {
  const [grid, batteries, pvEntities, prices, curtailment] = await Promise.all([
    readGrid(),
    listBatteries(),
    listPvEntities(),
    readPriceConfig(),
    readCurtailmentConfig(),
  ]);

  return { grid, batteries, pvEntities, prices, curtailment };
}

/** Changes to these inputs can trigger another decision. */
function controlReadingIds(config: TickConfig): string[] {
  const { grid, batteries, pvEntities, curtailment } = config;

  return [
    ...(isGridConfigured(grid) ? [grid.powerEntityId] : []),
    // Battery power belongs to curtailment for a reason that is not obvious:
    // it does not command batteries, but a discharging one hides the shortfall
    // its feedback law is looking for, so the law has to be able to see it.
    // See `curtail.ts`.
    ...(curtailment.enabled
      ? batteries.map((battery) => battery.powerEntityId)
      : []),
    ...(curtailment.enabled
      ? [
          ...pvEntities.map((entity) => entity.powerEntityId),
          // And the car sensor for the same reason: plugging one in is a change
          // in what the house can absorb, and it should provoke a tick rather
          // than waiting out an interval with the arrays still held down.
          curtailment.carChargingEntityId,
        ]
      : []),
  ].filter(Boolean);
}

type Snapshots = {
  gridPowerW: number | null;
  batteries: PvBatterySnapshot[];
  arrays: PvArraySnapshot[];
  gridConfigured: boolean;
  provenance: string;
  priceError: string | null;
  /** What a kWh put on the grid earns right now, or null when unknown. */
  productionPricePerKwh: number | null;
  /**
   * Whether a car wants the surplus, or null when nothing says — no sensor
   * configured, or one that is not readable. See `curtail.ts`.
   */
  carCharging: boolean | null;
  currency: string;
  /** Each curtailable array's slug, by array id, ready to publish. */
  pvSlugs: Map<string, string>;
};

async function readSnapshots(config: TickConfig): Promise<Snapshots> {
  const { grid, batteries, pvEntities, prices, curtailment } = config;
  const gridConfigured = isGridConfigured(grid);

  const readingIds = controlReadingIds(config);
  const { states, error } = await readStates(readingIds);

  // The page can render dashes when Home Assistant is unreachable; a decision
  // cannot be made out of them. Raising it here turns the outage into one
  // "Tick failed" line and keeps the schedule, rather than a stream of ticks
  // that read like the house is idle when the truth is that nobody asked it.
  if (error) throw new Error(error);

  const stateOf = (id: string) => states.get(id)?.state ?? null;

  const readings = new Map(
    readingIds.flatMap((id) => {
      const read = states.get(id);
      return read ? [[id, read] as const] : [];
    }),
  );

  const priceRead = cachedPrices(prices);

  return {
    gridConfigured,
    gridPowerW: gridConfigured ? toNumber(stateOf(grid.powerEntityId)) : null,
    batteries: batteries.map((battery) => ({
      title: battery.title,
      powerW: toNumber(stateOf(battery.powerEntityId)),
    })),
    arrays: pvEntities.map((entity) => ({
      id: entity.id,
      title: entity.title,
      powerW: toNumber(stateOf(entity.powerEntityId)),
      ratedPowerW: entity.ratedPowerW,
      curtailable: entity.curtailable,
      controlMode: entity.controlMode,
      stepLimitPercent: entity.stepLimitPercent,
    })),
    productionPricePerKwh: priceRead.now?.productionPerKwh ?? null,
    carCharging: curtailment.carChargingEntityId
      ? toBoolean(stateOf(curtailment.carChargingEntityId))
      : null,
    currency: "EUR",
    priceError: priceRead.error,
    provenance: describeSource(readings),
    pvSlugs: new Map(
      pvEntities
        .filter(isCurtailable)
        .map((entity) => [entity.id, pvSlug(entity)]),
    ),
  };
}

/**
 * Where this tick's numbers came from and how old the oldest of them is, as one
 * clause for the log.
 *
 * Ages do not gate anything — a sensor holding the same value emits no events,
 * so an old reading on a quiet house is normal and refusing to decide on it
 * would be worse than useless. This line is how a genuinely stuck sensor
 * becomes visible instead: nothing else is watching, so the log has to be
 * legible enough that a person can.
 */
function describeSource(states: Parameters<typeof readingAge>[0]): string {
  const { source, oldestSeconds } = readingAge(states);
  if (!source) return "no readings";

  const via = source === "live" ? "live cache" : "REST";
  return oldestSeconds === null
    ? `via ${via}`
    : `via ${via}, oldest reading ${oldestSeconds}s`;
}

async function tickCurtailment(
  inputs: Snapshots,
  config: CurtailmentConfig,
  nowMs: number,
): Promise<void> {
  if (!inputs.gridConfigured) {
    log(
      "pv-curtailment",
      "warn",
      "The grid sensor is not configured — nothing to curtail against.",
    );
    return;
  }

  const input: CurtailInput = {
    gridPowerW: inputs.gridPowerW,
    arrays: inputs.arrays,
    // Every battery, steered or not: a battery discharging into the house is
    // hiding the same watts from the meter whoever is telling it to. Nothing is
    // commanded to them from this half — `curtail.ts` reads their power and
    // stops the arrays being held down in their place.
    batteries: inputs.batteries,
    productionPricePerKwh: inputs.productionPricePerKwh,
    carCharging: inputs.carCharging,
    currency: inputs.currency,
    config,
    nowMs,
    offTargetSinceMs: state.offTargetSinceMs,
  };

  const plan = planCurtailment(input);

  // The settle clock, kept here because `curtail.ts` may not read one. Cleared
  // whenever the meter is on target so that the next excursion waits its full
  // settle time rather than inheriting credit from an unrelated one.
  if (!plan.offTarget) state.offTargetSinceMs = null;
  else if (state.offTargetSinceMs === null) state.offTargetSinceMs = nowMs;

  const commands = plan.decisions.flatMap((decision) => {
    const slug = inputs.pvSlugs.get(decision.arrayId);
    const array = inputs.arrays.find(
      (candidate) => candidate.id === decision.arrayId,
    );
    if (!slug || !array?.ratedPowerW) return [];
    return [
      {
        arrayId: decision.arrayId,
        title: decision.title,
        slug,
        ratedPowerW: array.ratedPowerW,
        commandPercent: decision.commandPercent,
        released: decision.released,
        controlMode: array.controlMode,
        // The one piece of feedback the publish layer gets: without it, an
        // inverter that quietly dropped its limit would never be corrected,
        // because the plan computes the same percent either way.
        measuredW: array.powerW,
      },
    ];
  });

  // Asked before publishing, because publishing is what updates the memory this
  // reads. Kept separate from the publish outcome on purpose: a stepped
  // inverter stops being *written* to after a couple of re-assertions, and the
  // fault has to stay visible for as long as it lasts rather than disappearing
  // from the log at the same moment the add-on gives up on fixing it.
  const ignoring = commands.filter(isIgnoringItsLimit).map((c) => c.title);

  const publishes = await publishPvLimits(commands);

  // Restart the settle clock whenever a *new* number has gone to the hardware,
  // so that `settleSeconds` is the shortest time between two moves and not
  // merely a delay before the first one.
  //
  // Without this the clock cleared only on coming back on target, so a meter
  // that stayed off it — the ordinary case in a house whose load moves — left
  // `offTargetForMs` growing without bound and every tick acted. The loop then
  // measured before its own last correction had landed: an inverter ramp takes
  // seconds, and the grid and PV sensors do not update together, so `C` and `G`
  // in `C + (G - G_target)` end up describing different instants and the
  // correction is counted twice. It showed up as one-percent dither while the
  // house was quiet and as swings of tens of percent while it was not.
  //
  // A restatement is deliberately not a move: it repeats a number the array is
  // already ignoring, so there is nothing newly in flight to wait for.
  const moved = publishes.some(
    (publish) =>
      publish.status === "published" &&
      (publish.reason === "changed" || publish.reason === "first"),
  );
  // Guarded on the plan having been off target, because a release publishes
  // from the on-target path: starting a clock there would hand the *next*
  // excursion a head start it never earned.
  if (plan.offTarget && moved) state.offTargetSinceMs = nowMs;

  const sent = describePvLimitPublishes(publishes);

  const lines = [
    `${plan.summary} (${inputs.provenance})`,
    ...(inputs.priceError ? [`! ${inputs.priceError}`] : []),
    ...plan.warnings.map((warning) => `! ${warning}`),
    ...plan.decisions.map((decision) => decision.message),
    ...(ignoring.length > 0
      ? [
          `! ${ignoring.join(", ")} generating well above the limit given — check the automation is running and that the inverter accepts it.`,
        ]
      : []),
    ...(sent ? [sent] : []),
  ];

  const troubled = publishes.some((publish) => publish.status === "failed");
  // An array ignoring its limit is a warning, not routine traffic: it means an
  // automation is missing, listening for an old name, or an inverter is not
  // honouring what it was sent — the one failure this feature otherwise cannot
  // see.
  //
  // Driven by `ignoring` rather than by what was published, and the difference
  // matters for a stepped inverter: the add-on stops *writing* to one after a
  // couple of re-assertions, and the fault must not vanish from the log at the
  // same moment it gives up trying to fix it.
  log(
    "pv-curtailment",
    inputs.priceError ||
      plan.warnings.length > 0 ||
      troubled ||
      ignoring.length > 0 ||
      anyNotInForce(publishes)
      ? "warn"
      : "info",
    lines.join("\n"),
  );
}

export async function runControlTick(): Promise<void> {
  const config = await readTickConfig();
  const inputs = await readSnapshots(config);
  const nowMs = Date.now();

  if (config.curtailment.enabled) {
    await tickCurtailment(inputs, config.curtailment, nowMs);
  }

  state.lastTickAt = new Date().toISOString();
}

/** Release all configured arrays before disabling or stopping the app. */
export async function releasePvArrays(): Promise<void> {
  const arrays = (await listPvEntities()).filter(isCurtailable);
  if (arrays.length === 0) return;

  const publishes = await publishPvLimits(
    arrays.map((array) => ({
      arrayId: array.id,
      title: array.title,
      slug: pvSlug(array),
      ratedPowerW: array.ratedPowerW,
      commandPercent: 100,
      released: true,
      controlMode: array.controlMode,
      // Nothing to check against at full output; `force` is what carries this.
      measuredW: null,
      // Past the "nothing changed" check, for the same reason a battery's
      // release is: what we believe the array is set to is exactly what is in
      // doubt at the moment we are letting go of it.
      force: true,
    })),
  );

  forgetPublishedLimits();
  state.offTargetSinceMs = null;

  const trouble = publishes.filter((publish) => publish.status !== "published");
  log(
    "pv-curtailment",
    trouble.length > 0 ? "error" : "info",
    trouble.length > 0
      ? `Released the arrays, but ${trouble
          .map(
            (publish) =>
              `${publish.title} (${publish.detail ?? publish.status})`,
          )
          .join(", ")} did not go out — check it is not still being held back.`
      : `Released ${publishes.length === 1 ? "the array" : "the arrays"} to 100%.`,
  );
}

/**
 * Hands **one** array back, for when it alone stops being steered — removed
 * from settings, or un-ticked, or its rating cleared.
 *
 * Takes the record as it was *before* the change, which is the whole point: an
 * array that has just been deleted is no longer on disk to look up, and one
 * whose rating has just been cleared no longer has the number the limit was a
 * percentage of. Neither could be released from what settings now say.
 *
 * Without this the last limit published for that array would stand for ever.
 * Nothing decides for it any more, so nothing would ever supersede it, and the
 * add-on would go on quietly costing its owner a slice of every sunny day.
 */
export async function releasePvArray(array: PvEntity): Promise<void> {
  if (!isCurtailable(array)) return;

  const [publish] = await publishPvLimits([
    {
      arrayId: array.id,
      title: array.title,
      slug: pvSlug(array),
      ratedPowerW: array.ratedPowerW,
      commandPercent: 100,
      released: true,
      controlMode: array.controlMode,
      // Nothing to check against at full output; `force` is what carries this.
      measuredW: null,
      force: true,
    },
  ]);

  forgetPublishedLimit(array.id);

  log(
    "pv-curtailment",
    publish.status === "published" ? "info" : "error",
    publish.status === "published"
      ? `${array.title} is no longer curtailable — released it to 100%.`
      : `${array.title} is no longer curtailable, but the release did not go out (${publish.detail ?? publish.status}) — check it is not still being held back.`,
  );
}

/**
 * Starts a tick without waiting for it — the interval callback cannot be async
 * and nothing about serving a page depends on the outcome. The promise is kept
 * in `state.inFlight` so it can be both the overlap guard and something tests
 * can await; see `pendingControlTick`.
 */
function startTick(): void {
  // A tick that is still waiting on Home Assistant must not have a second one
  // pile up behind it: ticks can be a few seconds apart and an
  // unreachable HA takes far longer than that to give up, which is exactly when
  // overlap would start.
  if (state.inFlight) {
    logLoop("warn", "Previous tick is still running — skipping this one.");
    return;
  }

  state.lastTickStartedAt = Date.now();
  state.inFlight = runControlTick()
    .catch((error: unknown) => {
      // Home Assistant restarting, a revoked token, a network blip: log it and
      // keep the schedule. A loop that dies on the first outage is worse than no
      // loop, because from the outside it still looks like it is working.
      const message = error instanceof Error ? error.message : String(error);
      logLoop("error", `Tick failed: ${message}`);
    })
    .finally(() => {
      state.inFlight = null;
      void refreshWatched();
    });
}

/**
 * Keeps the watched set in step with the configuration. Cheap enough to redo
 * after each tick, and doing it there means saving settings takes effect on the
 * next one rather than needing the loop restarted.
 */
async function refreshWatched(): Promise<void> {
  try {
    state.watched = new Set(controlReadingIds(await readTickConfig()));
  } catch {
    // A missing or unreadable config file is already the settings pages's
    // problem to report; the previous set stays in force until it is fixed.
  }
}

/**
 * A change arrived. Tick now if the rate limit allows, otherwise owe one.
 *
 * Leading edge, so the first change after a quiet spell is acted on at once —
 * that immediacy is the whole reason for driving this from events. The trailing
 * tick is what stops the *last* change before a lull from being the one that
 * gets swallowed, which would leave a decision standing on a reading nobody
 * looked at again.
 */
let priceBoundary: ReturnType<typeof setTimeout> | undefined;

function schedulePriceBoundary(): void {
  priceBoundary = setTimeout(
    () => {
      requestPriceTick();
      schedulePriceBoundary();
    },
    PRICE_SLOT_MS - (Date.now() % PRICE_SLOT_MS),
  );
  priceBoundary.unref();
}

export function requestPriceTick(): void {
  if (!state.timer) return;
  if (state.inFlight) {
    const timer = state.timer;
    void state.inFlight.then(() => {
      if (state.timer === timer) requestTick();
    });
    return;
  }
  requestTick();
}

function requestTick(): void {
  const since =
    state.lastTickStartedAt === null
      ? Number.POSITIVE_INFINITY
      : Date.now() - state.lastTickStartedAt;

  if (since >= minTickMs()) {
    startTick();
    return;
  }

  if (state.trailing) return;
  state.trailing = setTimeout(() => {
    state.trailing = null;
    startTick();
  }, minTickMs() - since);
  state.trailing.unref?.();
}

/**
 * The tick currently in flight, or an already-settled promise when there isn't
 * one. Exists so tests can wait for a tick to finish talking to Home Assistant:
 * a fake clock can move the interval along, but it cannot make real I/O land.
 */
export function pendingControlTick(): Promise<void> {
  return state.inFlight ?? Promise.resolve();
}

export function stopControlLoop(): void {
  clearTimeout(priceBoundary);
  priceBoundary = undefined;
  state.unsubscribe?.();
  state.unsubscribe = null;

  if (state.trailing) clearTimeout(state.trailing);
  state.trailing = null;

  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = null;
}

/**
 * Whether the shutdown handlers are already installed. Module state, like the
 * loop itself, because the process only has one set of signals to listen for.
 */
let shutdownArmed = false;
let shuttingDown = false;
let settingsQueue = Promise.resolve();

export function withCurtailmentPaused<T>(change: () => Promise<T>): Promise<T> {
  const result = settingsQueue.then(async () => {
    stopControlLoop();
    await pendingControlTick();
    try {
      return await change();
    } finally {
      if (!shuttingDown) await syncControlLoop();
    }
  });
  settingsQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function armShutdownRelease(): void {
  if (shutdownArmed) return;
  shutdownArmed = true;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      shuttingDown = true;
      stopControlLoop();
      void settingsQueue
        .then(() => pendingControlTick())
        .then(async () => {
          if (state.curtailment?.enabled) await releasePvArrays();
        })
        .catch((error) => console.error("Could not release PV arrays:", error))
        .finally(() => process.exit(0));
    });
  }
}

export async function syncControlLoop(): Promise<
  ReturnType<typeof curtailmentLoopStatus>
> {
  const curtailment = await readCurtailmentConfig();
  const wasEnabled = state.curtailment?.enabled;
  state.curtailment = curtailment;

  if (!curtailment.enabled) {
    stopControlLoop();
    await pendingControlTick();
    if (wasEnabled) {
      logLoop("info", "PV curtailment disabled.");
      await releasePvArrays();
    }
    return curtailmentLoopStatus();
  }

  if (state.timer) {
    await refreshWatched();
    return curtailmentLoopStatus();
  }

  if (!wasEnabled) logLoop("info", "PV curtailment enabled.");
  await refreshWatched();
  if (shuttingDown) return curtailmentLoopStatus();
  armShutdownRelease();

  // Home Assistant decides when there is something new to decide about. The
  // rate limit is a ceiling on how often that can produce a tick rather than
  // the thing that produces them, so a grid reading that moves is acted on in
  // the time it takes to arrive instead of up to a full interval later.
  state.unsubscribe = onHaChange((changed) => {
    if (changed === null || state.watched.has(changed)) requestTick();
  });

  state.timer = setInterval(startTick, IDLE_TICK_MS);
  schedulePriceBoundary();
  // Nothing here should be what keeps Node alive; the HTTP server is. Without
  // this a test that forgets to stop the loop hangs the whole run.
  state.timer.unref?.();

  // Tick once immediately so enabling a strategy produces a line at once
  // rather than after a silent interval.
  startTick();

  return curtailmentLoopStatus();
}

/** Whether the loop is running PV curtailment, and when it last ticked. */
export function curtailmentLoopStatus(): {
  running: boolean;
  lastTickAt: string | null;
} {
  return {
    running: state.timer !== null && state.curtailment?.enabled === true,
    lastTickAt: state.lastTickAt,
  };
}

/** Test-only: forget everything this module remembers between cases. */
export function resetControlLoop(): void {
  stopControlLoop();
  forgetPublishedLimits();
  state.curtailment = null;
  state.inFlight = null;
  state.lastTickAt = null;
  state.lastTickStartedAt = null;
  state.watched = new Set();
  state.offTargetSinceMs = null;
}
