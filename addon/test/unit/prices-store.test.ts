import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cachedPrices,
  refreshPrices,
  verifyPredictorPrices,
} from "../../app/lib/price-source.server";
import {
  DEFAULT_PRICE_CONFIG,
  type PriceConfig,
  parsePriceForecast,
  parsePriceFormulas,
  priceSlot,
} from "../../app/lib/prices";
import { readPriceConfig, savePriceConfig } from "../../app/lib/prices.server";

let dataDir: string;
beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "helper-prices-"));
  vi.stubEnv("DATA_DIR", dataDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await rm(dataDir, { recursive: true, force: true });
});

const config: PriceConfig = {
  source: "epex-predictor",
  region: "BE",
  consumptionFormula: "((price * 1.02) + 0.1272) * 1.06",
  productionFormula: "price * 0.98 - 0.015",
};

it("persists the source, zone and formulas and defaults to unconfigured", async () => {
  expect(await readPriceConfig()).toEqual(DEFAULT_PRICE_CONFIG);
  await savePriceConfig(config);
  expect(await readPriceConfig()).toEqual(config);
});

it("retires a legacy entity source and keeps its formulas for reselection", async () => {
  await writeFile(
    path.join(dataDir, "prices.json"),
    JSON.stringify({
      ...config,
      source: "home-assistant",
      region: undefined,
      forecastEntityId: "sensor.old",
    }),
  );
  expect(await readPriceConfig()).toEqual({
    ...config,
    source: "none",
    region: "",
  });
});

const published = (dates: string[], market: number[]) => ({
  unit: "EUR / MWh",
  unix_seconds: dates.map((date) => Date.parse(date) / 1000),
  price: market,
});

it("uses the same raw spot and applies formulas once, matching the legacy HA format", () => {
  const start = "2026-11-25T10:00:00Z";
  const { slots } = verifyPredictorPrices(
    {
      knownUntil: start,
      prices: [{ startsAt: start, total: 0.1821 }],
    },
    published([start], [182.13]),
  );
  const legacy = parsePriceForecast({
    currency: "EUR",
    unit_of_measurement: "EUR/kWh",
    raw_today: [
      { hour: start, price: 0.18213 },
      { hour: "2026-11-25T10:15:00Z", price: 0.19 },
    ],
  });
  if (!legacy.ok) throw new Error(legacy.error);
  const formulas = parsePriceFormulas(config);
  expect(priceSlot(slots[0], formulas)).toEqual(
    priceSlot(legacy.forecast.slots[0], formulas),
  );
});

it.each([
  ["autumn", "2026-10-25T02:45:00+02:00", "2026-10-25T02:00:00+01:00"],
  ["spring", "2026-03-29T01:45:00+01:00", "2026-03-29T03:00:00+02:00"],
])(
  "keeps quarter-hour UTC intervals through the %s DST transition",
  (_, first, second) => {
    const { slots } = verifyPredictorPrices(
      {
        knownUntil: second,
        prices: [
          { startsAt: second, total: -0.05 },
          { startsAt: first, total: 0.2 },
        ],
      },
      published([first, second], [200, -50]),
    );
    expect(slots).toHaveLength(2);
    expect(slots[0].end).toEqual(slots[1].start);
    expect(slots[1].spotPerKwh).toBe(-0.05);
  },
);

it("rejects forecast-only slots, missing market rows and conflicting estimates", () => {
  const dates = [
    "2026-11-25T10:00:00Z",
    "2026-11-25T10:15:00Z",
    "2026-11-25T10:30:00Z",
    "2026-11-25T10:45:00Z",
  ];
  const { slots } = verifyPredictorPrices(
    {
      knownUntil: dates[2],
      prices: dates.map((startsAt) => ({ startsAt, total: 0.2 })),
    },
    published([dates[0], dates[2], dates[3]], [250, 200, 200]),
  );
  expect(slots.map((slot) => Date.parse(slot.start))).toEqual([
    Date.parse(dates[2]),
  ]);
});

it("deduplicates requests, expires slots independently, and reports missing coverage", async () => {
  const date = "2026-11-25T10:00:00Z";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(date));
  const fetcher = vi.fn(async (url: URL) =>
    Response.json(
      url.hostname === "api.energy-charts.info"
        ? published([date], [200])
        : { prices: [{ startsAt: date, total: 0.2 }], knownUntil: date },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await Promise.all([
    refreshPrices(config),
    refreshPrices(config),
    refreshPrices(config),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(cachedPrices(config).now?.spotPerKwh).toBe(0.2);
  expect(cachedPrices(config, Date.parse(date) + 900_000)).toMatchObject({
    now: null,
    error: expect.stringContaining("No verified published price"),
  });
});
