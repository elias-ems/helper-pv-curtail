import { createHash } from "node:crypto";
import { readSettings } from "./settings-backup.server";

export const pvFieldKeys = [
  "title",
  "powerEntityId",
  "ratedPowerW",
  "controlMode",
  "stepLimitPercent",
] as const;

export async function readSettingsApi() {
  const settings = await readSettings();
  return {
    settings,
    revision: createHash("sha256")
      .update(JSON.stringify(settings))
      .digest("hex"),
  };
}

export function apiResponse(body: unknown, status = 200, allow?: string) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (allow) headers.set("Allow", allow);
  return Response.json(body, { status, headers });
}
