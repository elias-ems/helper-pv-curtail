import { withSettingsLock } from "../lib/control-loop.server";
import { apiResponse, readSettingsApi } from "../lib/settings-api.server";

export function loader() {
  return withSettingsLock(async () => apiResponse(await readSettingsApi()));
}

export function action() {
  return apiResponse({ error: "Use GET." }, 405, "GET");
}
