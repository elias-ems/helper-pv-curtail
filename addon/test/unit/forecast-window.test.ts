import { expect, it } from "vitest";
import { forecastWindow } from "../../app/lib/forecast-window.server";

it.each([
  [
    "2026-03-29T10:00:00Z",
    "2026-03-28T23:00:00Z",
    "2026-03-29T22:00:00Z",
    "2026-03-30T22:00:00Z",
  ],
  [
    "2026-10-25T10:00:00Z",
    "2026-10-24T22:00:00Z",
    "2026-10-25T23:00:00Z",
    "2026-10-26T23:00:00Z",
  ],
])(
  "uses local midnight across a daylight-saving transition on %s",
  (now, start, tomorrow, end) => {
    expect(forecastWindow(Date.parse(now), "Europe/Brussels")).toEqual({
      start: Date.parse(start),
      tomorrow: Date.parse(tomorrow),
      end: Date.parse(end),
    });
  },
);
