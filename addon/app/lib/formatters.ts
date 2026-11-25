/** Keep the same precision in the browser, server-rendered UI, and logs. */
export function formatMoney(value: number | null, unit?: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const amount = value.toFixed(3);
  return unit ? `${amount} ${unit}` : amount;
}

export function formatWatts(value: number): string {
  return `${Math.round(value)} W`;
}
