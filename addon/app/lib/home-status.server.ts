import { listBatteries } from "./batteries.server";
import { curtailmentLoopStatus } from "./control-loop.server";
import { readCurtailmentConfig } from "./curtailment-config.server";
import { readGrid } from "./grid.server";
import type { HomeDevice, HomeStatus } from "./home-status";
import { isCurtailable } from "./pv-entities";
import { listPvEntities } from "./pv-entities.server";
import { publishedLimitPercent, recentSentLimits } from "./pv-limits.server";
import { toBoolean, toNumber } from "./readings.server";
import { readStates, type StateRead } from "./states.server";

export async function readHomeStatus(): Promise<HomeStatus> {
  const [grid, arrays, batteries, config] = await Promise.all([
    readGrid(),
    listPvEntities(),
    listBatteries(),
    readCurtailmentConfig(),
  ]);

  const devices: Omit<HomeDevice, "reading">[] = [
    {
      key: "grid",
      title: "Grid meter",
      entityId: grid.powerEntityId,
      kind: "Grid",
    },
    ...arrays.map((array) => ({
      key: `pv-${array.id}`,
      title: array.title,
      entityId: array.powerEntityId,
      kind: "PV array" as const,
      canLimit: isCurtailable(array),
      limitPercent: publishedLimitPercent(array.id) ?? undefined,
    })),
    ...batteries.map((battery) => ({
      key: `battery-${battery.id}`,
      title: battery.title,
      entityId: battery.powerEntityId,
      kind: "Battery" as const,
    })),
    {
      key: "ev",
      title: "EV charger",
      entityId: config.carChargingEntityId,
      kind: "EV charger",
    },
  ];
  const linked = devices.filter((device) => device.entityId);

  const { states, error } = linked.length
    ? await readStates(linked.map(({ entityId }) => entityId))
    : { states: new Map<string, StateRead>(), error: null };

  return {
    running: curtailmentLoopStatus().running,
    devices: linked.map((device) => {
      const state = states.get(device.entityId)?.state ?? null;
      return {
        ...device,
        reading:
          device.kind === "EV charger" ? toBoolean(state) : toNumber(state),
      };
    }),
    limits: recentSentLimits(),
    connectionError: error,
  };
}
