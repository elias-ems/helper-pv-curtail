import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  parseSettingsBackup,
  serializeSettings,
} from "../../app/lib/settings-backup.server";
import { startStack } from "../stack.js";

it("downloads, previews, rejects and restores settings through ingress", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "helper-pv-backup-"));
  try {
    await writeFile(
      path.join(dataDir, "batteries.json"),
      JSON.stringify([
        {
          id: "battery-a",
          title: "Battery",
          powerEntityId: "sensor.battery",
          runtimeMarker: "exclude-me",
        },
      ]),
    );
    const stack = await startStack({ dataDir });
    try {
      const backupUrl = new URL("api/settings-backup.json", stack.baseUrl);
      const restoreUrl = new URL("settings/backup", stack.baseUrl);
      const response = await fetch(backupUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toMatch(
        /helper-pv-curtail-settings-.*\.json/,
      );
      const originalText = await response.text();
      expect(originalText).not.toContain("exclude-me");
      const original = parseSettingsBackup(originalText);
      const changed = {
        ...original,
        grid: { powerEntityId: "sensor.test_grid" },
        batteries: [],
        pvEntities: [
          {
            id: "pv-backup",
            title: "Roof from backup",
            powerEntityId: "sensor.roof",
            ratedPowerW: 5000,
            curtailable: true,
            controlMode: "modulating" as const,
            stepLimitPercent: null,
          },
        ],
        curtailment: { ...original.curtailment, deadbandW: 150 },
      };
      const preview = (payload: string) => {
        const form = new FormData();
        form.set("intent", "preview");
        form.set("backup", new Blob([payload]), "settings.json");
        return fetch(restoreUrl, { method: "POST", body: form });
      };
      const apply = (payload: string, revision: string) =>
        fetch(restoreUrl, {
          method: "POST",
          body: new URLSearchParams({
            intent: "apply",
            backup: payload,
            revision,
          }),
        });
      const read = async () =>
        parseSettingsBackup(await (await fetch(backupUrl)).text());

      const page = await fetch(new URL("settings", stack.baseUrl));
      expect(await page.text()).toContain(restoreUrl.pathname);
      const candidate = serializeSettings(changed);
      const previewed = await preview(candidate);
      expect(previewed.status).toBe(200);
      const html = await previewed.text();
      expect(html).toContain("Restore preview");
      expect(html).toContain("Apply backup");
      expect(html).toContain("Roof from backup");
      expect(await read()).toEqual(original);

      const revision = html.match(/name="revision" value="([a-f0-9]+)"/)?.[1];
      if (!revision)
        throw new Error("Preview did not issue an apply revision.");
      const active = await preview(
        serializeSettings({
          ...changed,
          prices: { ...changed.prices, source: "epex-predictor", region: "BE" },
          curtailment: { ...changed.curtailment, enabled: true },
        }),
      );
      expect(active.status).toBe(200);
      expect(await active.text()).toContain(
        "elias_ems_pv_curtail_roof_from_backup_pv_limit",
      );
      expect(await read()).toEqual(original);

      const invalid = serializeSettings({
        ...changed,
        curtailment: { ...changed.curtailment, deadbandW: -1 },
      });
      expect((await preview(invalid)).status).toBe(400);
      expect((await apply(invalid, revision)).status).toBe(400);
      expect(await read()).toEqual(original);
      expect((await apply(candidate, revision)).status).toBe(200);
      expect(await read()).toEqual(changed);
      expect((await apply(candidate, revision)).status).toBe(400);
      expect(await read()).toEqual(changed);

      const rollback = await preview(originalText);
      expect(rollback.status).toBe(200);
      const rollbackRevision = (await rollback.text()).match(
        /name="revision" value="([a-f0-9]+)"/,
      )?.[1];
      if (!rollbackRevision)
        throw new Error("Rollback preview did not issue a revision.");
      expect((await apply(originalText, rollbackRevision)).status).toBe(200);
      expect(await read()).toEqual(original);
    } finally {
      await stack.close();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
