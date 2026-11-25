import { appendDiagnostic } from "./diagnostics.server";
import { formatPricePerKwh } from "./price-format.server";
import {
  isPriceConfigured,
  type PriceConfig,
  type PricePoint,
  type PriceRegion,
  type PriceSlot,
  type PriceSourceSummary,
  parsePriceFormulas,
  priceSlot,
} from "./prices";
import { readPriceConfig } from "./prices.server";

export const PRICE_SLOT_MS = 15 * 60_000;
const REFRESH_MS = 60 * 60_000;
const RETRY_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

type PriceSeries = {
  slots: PriceSlot[];
  reason: string | null;
};

type Cache = PriceSeries & {
  refreshAt: number;
  pending?: Promise<void>;
};

const cache = new Map<PriceRegion, Cache>();
let notifyRefresh: (() => void) | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function instant(value: unknown): number {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value)
    : Number.NaN;
}

export function verifyPredictorPrices(
  prediction: unknown,
  published: unknown,
): PriceSeries {
  const { prices, knownUntil } = record(prediction);
  const cutoff = instant(knownUntil);
  if (!Array.isArray(prices) || !Number.isFinite(cutoff)) {
    throw new Error(
      "EPEX Predictor returned invalid prices or an invalid knownUntil timestamp.",
    );
  }

  const { unix_seconds: dates, price: values, unit } = record(published);
  if (
    unit !== "EUR / MWh" ||
    !Array.isArray(dates) ||
    !Array.isArray(values) ||
    dates.length !== values.length
  ) {
    throw new Error("Energy-Charts returned invalid day-ahead prices.");
  }

  const reference = new Map<number, number>();
  dates.forEach((date: unknown, index) => {
    const value: unknown = values[index];
    if (
      typeof date === "number" &&
      Number.isSafeInteger(date) &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      reference.set(date * 1000, value / 1000);
    }
  });

  const verified = new Map<number, PriceSlot>();
  for (const row of prices) {
    const { startsAt, total } = record(row);
    const start = instant(startsAt);
    const market = reference.get(start);
    // Predictor rounds EUR/kWh to four decimal places.
    if (
      start % PRICE_SLOT_MS !== 0 ||
      start > cutoff ||
      market === undefined ||
      typeof total !== "number" ||
      !Number.isFinite(total) ||
      Math.abs(total - market) > 0.0000500001
    )
      continue;
    verified.set(start, {
      start: new Date(start).toISOString(),
      end: new Date(start + PRICE_SLOT_MS).toISOString(),
      spotPerKwh: market,
    });
  }

  return {
    slots: [...verified.values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
    reason:
      "No verified published price covers the current slot. EPEX Predictor may only have forecasts, or the published price is missing or differs.",
  };
}

async function getJson(url: URL, provider: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(
      `${provider} price refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function fetchPrices(
  region: PriceRegion,
  now: number,
): Promise<PriceSeries> {
  const start = Math.floor(now / PRICE_SLOT_MS) * PRICE_SLOT_MS;
  const predictor = new URL(
    process.env.EPEX_PREDICTOR_URL ??
      "https://epexpredictor.batzill.com/prices",
  );
  predictor.search = new URLSearchParams({
    region,
    unit: "EUR_PER_KWH",
    timezone: "UTC",
    startTs: new Date(start).toISOString(),
    hours: "36",
  }).toString();

  const market = new URL(
    process.env.PUBLISHED_PRICES_URL ?? "https://api.energy-charts.info/price",
  );
  market.search = new URLSearchParams({
    bzn: region === "DE" ? "DE-LU" : region,
    start: String(start / 1000),
    end: String(start / 1000 + 36 * 3600),
  }).toString();

  const [predicted, published] = await Promise.all([
    getJson(predictor, "EPEX Predictor"),
    getJson(market, "Energy-Charts"),
  ]);
  return verifyPredictorPrices(predicted, published);
}

function currentSlot(slots: PriceSlot[], now: number): PriceSlot | undefined {
  return slots.find(
    ({ start, end }) => Date.parse(start) <= now && now < Date.parse(end),
  );
}

export function cachedPrices(
  config: PriceConfig,
  now = Date.now(),
): {
  now: PricePoint | null;
  error: string | null;
} {
  if (!isPriceConfigured(config))
    return {
      now: null,
      error: "Select EPEX Predictor and a bidding zone in Settings.",
    };
  const entry = config.region ? cache.get(config.region) : undefined;
  const slot = currentSlot(entry?.slots ?? [], now);
  return {
    now: slot ? priceSlot(slot, parsePriceFormulas(config)) : null,
    error: slot
      ? null
      : (entry?.reason ?? "Waiting for verified EPEX Predictor prices."),
  };
}

export async function refreshPrices(config: PriceConfig): Promise<void> {
  if (!isPriceConfigured(config) || !config.region) return;
  const region = config.region;
  const entry = cache.get(region) ?? { slots: [], reason: null, refreshAt: 0 };
  cache.set(region, entry);
  if (entry.pending) return entry.pending;
  const now = Date.now();
  if (now < entry.refreshAt) return;

  entry.pending = (async () => {
    try {
      const { slots, reason } = await fetchPrices(region, now);
      entry.slots = slots;
      entry.reason = reason;
      const finished = Date.now();
      let coverageEnd = Math.floor(finished / PRICE_SLOT_MS) * PRICE_SLOT_MS;
      for (const slot of slots) {
        if (Date.parse(slot.start) === coverageEnd)
          coverageEnd += PRICE_SLOT_MS;
      }
      entry.refreshAt = Math.min(
        finished + REFRESH_MS,
        Math.max(finished + RETRY_MS, coverageEnd),
      );
    } catch (error) {
      entry.reason = error instanceof Error ? error.message : String(error);
      entry.refreshAt = Date.now() + RETRY_MS;
      appendDiagnostic("prices", "warn", entry.reason);
    }
  })();
  try {
    await entry.pending;
  } finally {
    entry.pending = undefined;
    notifyRefresh?.();
  }
}

export function startPriceRefresh(onRefresh: () => void): void {
  notifyRefresh = onRefresh;
  const poll = async () => {
    try {
      await refreshPrices(await readPriceConfig());
    } catch (error) {
      appendDiagnostic(
        "prices",
        "warn",
        `Could not read the price settings: ${String(error)}`,
      );
    }
  };
  void poll();
  setInterval(poll, 60_000).unref();
}

export async function readPrices() {
  const config = await readPriceConfig();
  await refreshPrices(config);
  return { config, read: cachedPrices(config) };
}

export function summarizePrices(
  read: ReturnType<typeof cachedPrices>,
): PriceSourceSummary {
  const now = read.now;
  return {
    ok: now !== null,
    detail: read.error ?? "The current day-ahead price is verified.",
    spot: now ? formatPricePerKwh(now.spotPerKwh, "EUR") : null,
    consumption: now ? formatPricePerKwh(now.consumptionPerKwh, "EUR") : null,
    production: now ? formatPricePerKwh(now.productionPerKwh, "EUR") : null,
    spotPerKwh: now?.spotPerKwh ?? null,
    currency: "EUR",
  };
}
