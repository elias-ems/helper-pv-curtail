export type BatteryFields = { title: string; powerEntityId: string };
export type Battery = BatteryFields & { id: string };
export type BatteryErrors = Partial<Record<keyof BatteryFields, string>>;

export function parseBattery(
  formData: FormData,
): { ok: true; fields: BatteryFields } | { ok: false; errors: BatteryErrors } {
  const title = String(formData.get("title") ?? "").trim();
  const powerEntityId = String(formData.get("powerEntityId") ?? "").trim();
  const errors: BatteryErrors = {};
  if (!title) errors.title = "Enter a name.";
  if (!powerEntityId) errors.powerEntityId = "Pick the battery power sensor.";
  if (!title || !powerEntityId) return { ok: false, errors };
  return { ok: true, fields: { title, powerEntityId } };
}
