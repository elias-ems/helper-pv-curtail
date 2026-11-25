import type { ForecastWindow } from "./price-forecast";
import type { PriceRegion } from "./prices";

export function marketTimeZone(region: PriceRegion): string {
  return region === "PT" ? "Europe/Lisbon" : "Europe/Brussels";
}

export function forecastWindow(now: number, timeZone: string): ForecastWindow {
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const calendarDay = Date.parse(`${calendar.format(now)}T00:00:00Z`);
  const offsets = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "longOffset",
  });
  function localMidnight(day: number): number {
    const offset =
      offsets.formatToParts(day).find(({ type }) => type === "timeZoneName")
        ?.value ?? "GMT";
    return Date.parse(
      `${new Date(day).toISOString().slice(0, 10)}T00:00:00${offset.slice(3) || "Z"}`,
    );
  }

  const dayMs = 86_400_000;
  return {
    start: localMidnight(calendarDay),
    tomorrow: localMidnight(calendarDay + dayMs),
    end: localMidnight(calendarDay + 2 * dayMs),
  };
}
