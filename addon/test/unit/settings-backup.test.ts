import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { saveGrid } from "../../app/lib/grid.server";
import {
  previewRevision,
  readSettings,
  restoreSettings,
} from "../../app/lib/settings-backup.server";

const { releasePvArray } = vi.hoisted(() => ({
  releasePvArray: vi.fn(async (_array: unknown) => true),
}));

vi.mock("../../app/lib/control-loop.server", () => ({
  releasePvArray,
  withSettingsLock: (change: () => Promise<unknown>) => change(),
  pauseCurtailment: (change: () => Promise<unknown>) => change(),
}));

it("uses the outgoing array for release and commits only after release and write succeed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "helper-pv-backup-"));
  vi.stubEnv("DATA_DIR", directory);
  const oldArray = {
    id: "old",
    title: "Old roof",
    powerEntityId: "sensor.roof",
    ratedPowerW: 4200,
    curtailable: true,
    controlMode: "modulating",
    stepLimitPercent: null,
  };
  try {
    await writeFile(
      path.join(directory, "pv-entities.json"),
      JSON.stringify([oldArray]),
    );
    await writeFile(
      path.join(directory, "curtailment.json"),
      JSON.stringify({ enabled: true }),
    );
    const before = await readSettings();
    const desired = {
      ...before,
      pvEntities: [],
      grid: { powerEntityId: "sensor.restored_grid" },
      curtailment: { ...before.curtailment, enabled: false },
    };
    const revision = previewRevision(before, desired);

    releasePvArray.mockResolvedValueOnce(false);
    await expect(restoreSettings(desired, revision)).rejects.toThrow(
      "could not release",
    );
    expect(await readSettings()).toEqual(before);
    expect(releasePvArray).toHaveBeenLastCalledWith(oldArray);

    const snapshotPath = path.join(directory, "settings.json");
    releasePvArray.mockImplementationOnce(async () => {
      await mkdir(snapshotPath);
      return true;
    });
    await expect(restoreSettings(desired, revision)).rejects.toThrow();
    await rm(snapshotPath, { recursive: true });
    expect(await readSettings()).toEqual(before);

    await restoreSettings(desired, revision);
    expect(await readSettings()).toEqual(desired);
    await saveGrid({ powerEntityId: "sensor.edited_grid" });
    expect(await readSettings()).toEqual({
      ...desired,
      grid: { powerEntityId: "sensor.edited_grid" },
    });
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
