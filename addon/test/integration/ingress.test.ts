import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  bandFieldName,
  DEFAULT_CURTAILMENT_CONFIG,
} from "../../app/lib/curtailment";
import { forecastWindow } from "../../app/lib/forecast-window.server";
import type { HomePriceForecast } from "../../app/lib/price-forecast";
import { startStack } from "../stack.js";

it("configures EPEX Predictor through ingress and releases on unverified prices, disable and shutdown", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "helper-pv-curtail-"));
  const now = Date.now();
  const current = Math.floor(now / 900_000) * 900_000;
  const { start: today, tomorrow } = forecastWindow(now, "Europe/Brussels");
  const slots = [...new Set([today, current, current + 900_000, tomorrow])];
  const priceApi = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/predictor") {
      const region = url.searchParams.get("region");
      expect(["BE", "NL"]).toContain(region);
      expect(url.searchParams.get("unit")).toBe("EUR_PER_KWH");
      expect(Date.parse(url.searchParams.get("startTs") ?? "")).toBe(today);
      response.end(
        JSON.stringify({
          prices: slots.map((ts) => ({
            startsAt: new Date(ts).toISOString(),
            total: 0.2,
          })),
          knownUntil:
            region === "NL"
              ? new Date(current - 900_000).toISOString()
              : new Date(current).toISOString(),
        }),
      );
    } else {
      expect(["BE", "NL"]).toContain(url.searchParams.get("bzn"));
      expect(Number(url.searchParams.get("start"))).toBe(today / 1000);
      response.end(
        JSON.stringify({
          unix_seconds: slots.map((slot) => slot / 1000),
          price: slots.map(() => 200),
          unit: "EUR / MWh",
        }),
      );
    }
  });
  await new Promise<void>((resolve) =>
    priceApi.listen(0, "127.0.0.1", resolve),
  );
  try {
    const address = priceApi.address();
    if (!address || typeof address === "string")
      throw new Error("Price mock unavailable");
    const stack = await startStack({
      dataDir,
      priceApiUrl: `http://127.0.0.1:${address.port}`,
    });
    try {
      const home = await fetch(stack.baseUrl);
      expect(home.status).toBe(200);
      const html = await home.text();
      expect(html).toContain("Curtailment is disabled.");
      const asset = html.match(/href="([^"]+\/assets\/[^"]+)"/)?.[1];
      expect(asset).toBeDefined();
      expect((await fetch(new URL(asset ?? "", stack.baseUrl))).ok).toBe(true);

      const settings = new URL("settings", stack.baseUrl);
      async function save(fields: Record<string, string>, json = false) {
        const response = await fetch(settings, {
          method: "POST",
          headers: {
            Origin: stack.origin,
            ...(json ? { "Content-Type": "application/json" } : {}),
          },
          body: json ? JSON.stringify(fields) : new URLSearchParams(fields),
        });
        expect(response.status).toBe(200);
        return response.text();
      }

      await save(
        { intent: "grid-save", powerEntityId: "sensor.grid_power" },
        true,
      );
      await save({
        intent: "pv-add",
        title: "South roof",
        powerEntityId: "sensor.inverter_power",
        curtailable: "on",
        ratedPowerW: "5000",
        controlMode: "modulating",
      });
      const belgianPrices = {
        intent: "prices-save",
        source: "epex-predictor",
        region: "BE",
        consumptionFormula: "price",
        productionFormula: "price - 10",
      };
      expect(await save(belgianPrices)).toContain(
        "helper_pv_curtail_south_roof_pv_limit",
      );
      const persisted = await (await fetch(settings)).text();
      expect(persisted).toContain('value="BE" selected=""');
      expect(persisted).toContain("-9.8000 EUR/kWh");

      const forecast = (await (
        await fetch(new URL("api/price-forecast", stack.baseUrl))
      ).json()) as HomePriceForecast;
      expect(forecast.window.tomorrow).toBe(tomorrow);
      expect(forecast.points).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            start: today,
            market: 0.2,
            import: 0.2,
            export: -9.8,
            verified: true,
          }),
          expect.objectContaining({
            start: tomorrow,
            market: 0.2,
            import: 0.2,
            export: -9.8,
            verified: false,
          }),
        ]),
      );
      const chart = await (await fetch(stack.baseUrl)).text();
      expect(chart).toContain(
        "Market prices in EUR per kWh for today and tomorrow",
      );
      expect(chart).toContain("Forecast");

      const curtailment: Record<string, string> = {
        intent: "curtailment-save",
        priceThresholdPerKwh: "0",
        gridTargetW: "0",
        deadbandW: "50",
        minLimitPercent: "0",
        settleSeconds: "0",
        strategy: "threshold",
      };
      DEFAULT_CURTAILMENT_CONFIG.bands.forEach((band, index) => {
        for (const field of [
          "abovePerKwh",
          "ceilingPercent",
          "exportPercent",
        ] as const) {
          curtailment[bandFieldName(index, field)] = String(band[field]);
        }
      });
      await save({ ...curtailment, enabled: "on" });

      const eventType = "helper_pv_curtail_south_roof_pv_limit";
      await expect
        .poll(() => stack.ha.events, { timeout: 10_000 })
        .toContainEqual(
          expect.objectContaining({
            eventType,
            data: expect.objectContaining({
              limit_percent: 42,
              released: false,
            }),
          }),
        );

      expect(await save({ ...belgianPrices, region: "NL" })).toContain(
        "No verified published price covers the current slot",
      );
      await expect
        .poll(() => stack.ha.events.at(-1))
        .toMatchObject({
          eventType,
          data: { limit_percent: 100, released: true },
        });
      await save(belgianPrices);
      await expect
        .poll(() => stack.ha.events.at(-1))
        .toMatchObject({
          eventType,
          data: { limit_percent: 42, released: false },
        });
      stack.ha.events.length = 0;
      await save(curtailment);
      expect(stack.ha.events).toContainEqual(
        expect.objectContaining({
          eventType,
          data: expect.objectContaining({ limit_percent: 100, released: true }),
        }),
      );
      stack.ha.events.length = 0;
      await save({ ...curtailment, enabled: "on" });
      await expect.poll(() => stack.ha.events.length).toBe(1);
    } finally {
      await stack.close();
    }
    expect(stack.ha.events.at(-1)).toMatchObject({
      eventType: "helper_pv_curtail_south_roof_pv_limit",
      data: { limit_percent: 100, released: true },
    });
  } finally {
    await new Promise<void>((resolve) => priceApi.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  }
});
