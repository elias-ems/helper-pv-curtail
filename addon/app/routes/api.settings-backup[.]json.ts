import { withSettingsLock } from "../lib/control-loop.server";
import { readSettings, serializeSettings } from "../lib/settings-backup.server";

export async function loader() {
  const backup = await withSettingsLock(async () =>
    serializeSettings(await readSettings()),
  );
  const day = new Date().toISOString().slice(0, 10);
  return new Response(backup, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="helper-pv-curtail-settings-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
