import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  bandFieldName,
  DEFAULT_CURTAILMENT_CONFIG,
} from "../../app/lib/curtailment";
import { startStack } from "../stack.js";

it("configures curtailment through ingress, publishes a limit, and releases on disable and shutdown", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "helper-pv-curtail-"));
  try {
    const stack = await startStack({ dataDir });
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
      expect(
        await save({
          intent: "prices-save",
          source: "home-assistant",
          forecastEntityId: "sensor.energi_epex_spot",
          consumptionFormula: "price",
          productionFormula: "price - 10",
        }),
      ).toContain("helper_pv_curtail_south_roof_pv_limit");

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
    await rm(dataDir, { recursive: true, force: true });
  }
});
