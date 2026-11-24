/**
 * The buffer and the file format. Nothing here touches Home Assistant or the
 * disk — diagnostics are process memory and a formatting function, which is
 * exactly why they can be tested this directly.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DiagnosticEntry,
  type DiagnosticsOrigin,
  formatDiagnostics,
} from "../../app/lib/diagnostics";
import {
  appendDiagnostic,
  clearDiagnostics,
  readDiagnostics,
} from "../../app/lib/diagnostics.server";

/**
 * A second origin, for the cases about several features sharing the log. Only
 * one exists so far, so the alternative is a test that starts working only on
 * the day some other feature happens to log something — by which point the
 * behaviour it covers would already have had to be right.
 */
const OTHER = "live-readings" as unknown as DiagnosticsOrigin;

beforeEach(() => {
  clearDiagnostics();
});

describe("appendDiagnostic", () => {
  it("stamps an entry with its origin and both timestamp shapes", () => {
    const entry = appendDiagnostic("pv-curtailment", "info", "Hello");

    expect(entry).toMatchObject({
      origin: "pv-curtailment",
      level: "info",
      message: "Hello",
      repeat: 1,
    });
    // `at` is for the downloaded file, `time` for the box — and `time` is
    // formatted on the server so a render can never disagree with itself.
    expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("collapses a repeated message into a count", () => {
    appendDiagnostic("pv-curtailment", "warn", "Same");
    appendDiagnostic("pv-curtailment", "warn", "Same");

    expect(readDiagnostics()).toMatchObject([{ message: "Same", repeat: 2 }]);
  });

  it("does not collapse across levels", () => {
    // Same sentence at a different severity is a different event, and merging
    // them would hide whichever of the two was the interesting one.
    appendDiagnostic("pv-curtailment", "info", "Same");
    appendDiagnostic("pv-curtailment", "error", "Same");

    expect(readDiagnostics()).toHaveLength(2);
  });
});

describe("readDiagnostics", () => {
  it("returns newest first", () => {
    appendDiagnostic("pv-curtailment", "info", "First");
    appendDiagnostic("pv-curtailment", "info", "Second");

    expect(readDiagnostics().map((entry) => entry.message)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("honours the limit", () => {
    for (const message of ["a", "b", "c"]) {
      appendDiagnostic("pv-curtailment", "info", message);
    }

    expect(readDiagnostics({ limit: 2 }).map((entry) => entry.message)).toEqual(
      ["c", "b"],
    );
  });

  it("filters to one origin, and merges every origin in time order without one", () => {
    appendDiagnostic("pv-curtailment", "info", "control one");
    appendDiagnostic(OTHER, "info", "other one");
    appendDiagnostic("pv-curtailment", "info", "control two");

    expect(
      readDiagnostics({ origin: "pv-curtailment" }).map(
        (entry) => entry.message,
      ),
    ).toEqual(["control two", "control one"]);

    expect(readDiagnostics().map((entry) => entry.message)).toEqual([
      "control two",
      "other one",
      "control one",
    ]);
  });

  it("keeps a run of one origin's repeats from collapsing on another's entries", () => {
    // The buffers are per origin, so a chatty feature interleaving with a quiet
    // one must not break the quiet one's repeat counting.
    appendDiagnostic("pv-curtailment", "info", "Steady");
    appendDiagnostic(OTHER, "info", "Something else");
    appendDiagnostic("pv-curtailment", "info", "Steady");

    expect(readDiagnostics({ origin: "pv-curtailment" })).toMatchObject([
      { message: "Steady", repeat: 2 },
    ]);
  });
});

describe("formatDiagnostics", () => {
  const entry = (over: Partial<DiagnosticEntry>): DiagnosticEntry => ({
    seq: 1,
    at: "2026-08-13T20:50:57.000Z",
    time: "22:50:57",
    origin: "pv-curtailment",
    level: "info",
    message: "Grid net +842 W",
    repeat: 1,
    ...over,
  });

  it("writes one header line per entry, with the message indented under it", () => {
    const text = formatDiagnostics([
      entry({ message: "Grid net +842 W\nHome battery: discharge at 842 W" }),
    ]);

    expect(text).toBe(
      "2026-08-13T20:50:57.000Z  pv-curtailment  info\n" +
        "    Grid net +842 W\n" +
        "    Home battery: discharge at 842 W\n",
    );
  });

  it("carries the repeat count, so a collapsed run isn't read as one event", () => {
    expect(formatDiagnostics([entry({ repeat: 12 })])).toContain("info (×12)");
  });
});
