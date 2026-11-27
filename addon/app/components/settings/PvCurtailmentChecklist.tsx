import { useId, useState } from "react";
import { formatMoney, formatWatts } from "../../lib/formatters";
import type { HomeStatus } from "../../lib/home-status";
import { usePolledJson } from "../../lib/json-fetch";
import type { HomePriceForecast } from "../../lib/price-forecast";
import {
  isCurtailable,
  type PvEntity,
  pvLimitEventType,
  pvSlug,
} from "../../lib/pv-entities";
import { pvAutomationYaml } from "../../lib/pv-onboarding";
import { hintStyle, inputStyle, labelStyle } from "../form";

export default function PvCurtailmentChecklist({
  arrays,
  enabled,
  reviewed,
  onReview,
}: {
  arrays: PvEntity[];
  enabled: boolean;
  reviewed: boolean;
  onReview: (reviewed: boolean) => void;
}) {
  const [open, setOpen] = useState(!enabled);
  const reviewId = useId();
  const options = {
    enabled: open,
    intervalMs: 5_000,
    hiddenIntervalMs: 30_000,
  };
  const status = usePolledJson<HomeStatus>("/api/home-status", options);
  const prices = usePolledJson<HomePriceForecast>(
    "/api/price-forecast",
    options,
  );
  const grid = status.data?.devices.find((device) => device.kind === "Grid");
  const gridW = typeof grid?.reading === "number" ? grid.reading : null;
  const now = Date.now();
  const price =
    prices.data?.points.find(
      (point) => point.verified && point.start <= now && now < point.end,
    )?.export ?? null;
  const gridDirection =
    gridW === null
      ? "Unavailable"
      : gridW > 0
        ? "Importing"
        : gridW < 0
          ? "Exporting"
          : "Balanced";
  const curtailable = arrays.filter(isCurtailable);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary style={labelStyle}>PV curtailment setup checklist</summary>
      <ol style={{ paddingInlineStart: "1.4rem" }}>
        <li>
          <h3>Check live readings</h3>
          <p style={hintStyle} role="status">
            {status.failing || prices.failing || status.data?.connectionError
              ? "Live readings are not updating."
              : (!status.data || !prices.data) && "Loading live readings…"}
          </p>
          <ul>
            <li>
              Grid: {gridDirection}
              {gridW !== null && ` (${formatWatts(gridW)})`}
              {" · "}
              <a href="#grid-settings">Grid settings</a>
            </li>
            <li>
              Verified export price:{" "}
              {price === null ? "Unavailable" : formatMoney(price, "EUR/kWh")}
              {" · "}
              <a href="#price-settings">Price settings</a>
            </li>
            {arrays.map((array) => {
              const power = status.data?.devices.find(
                (device) => device.key === `pv-${array.id}`,
              )?.reading;
              return (
                <li key={array.id}>
                  {array.title} PV power:{" "}
                  {typeof power === "number"
                    ? formatWatts(power)
                    : "Unavailable"}
                </li>
              );
            })}
            {arrays.length === 0 && (
              <li>PV power: Add an array to see its reading.</li>
            )}
          </ul>
          <p style={hintStyle}>
            Positive grid power means import. Negative means export. The export
            price includes your production tariff.
          </p>
        </li>
        <li>
          <h3>Confirm inverter settings</h3>
          <p style={hintStyle}>
            In <a href="#pv-settings">PV entities</a>, allow curtailment for
            each inverter you want to control. Use its nameplate AC output in
            watts. Choose “Follows the house” if the inverter supports frequent
            writes, or “One fixed step” with a supported limit if writes must be
            infrequent.
          </p>
          {curtailable.length === 0 && (
            <p style={hintStyle}>No curtailable arrays configured.</p>
          )}
          {curtailable.length > 0 && (
            <ul>
              {curtailable.map((array) => (
                <li key={array.id}>
                  {array.title}: {array.ratedPowerW} W AC,{" "}
                  {array.controlMode === "modulating"
                    ? "Follows the house"
                    : `One fixed step (${array.stepLimitPercent ?? "limit missing"}${array.stepLimitPercent === null ? "" : "%"})`}
                </li>
              ))}
            </ul>
          )}
        </li>
        <li>
          <h3>Set up Home Assistant automations</h3>
          <p style={hintStyle}>
            Paste each template into an automation’s YAML editor. Replace both
            placeholder targets. The example expects a percentage control that
            releases at 100%. If your inverter uses watts, use{" "}
            <code>limit_w</code> and adapt the release action. Match both
            actions to your inverter’s integration. Update the trigger after
            renaming an array.
          </p>
          {curtailable.map((array) => (
            <details key={array.id}>
              <summary>{array.title} automation YAML</summary>
              <p>
                Event:{" "}
                <code style={{ overflowWrap: "anywhere" }}>
                  {pvLimitEventType(pvSlug(array))}
                </code>
              </p>
              <textarea
                aria-label={`${array.title} automation YAML`}
                readOnly
                rows={10}
                value={pvAutomationYaml(array)}
                onFocus={(event) => event.currentTarget.select()}
                style={{
                  ...inputStyle(),
                  boxSizing: "border-box",
                  width: "100%",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
            </details>
          ))}
        </li>
        <li>
          <h3>Review and verify</h3>
          <p style={hintStyle}>
            With PV curtailment off, use Home Assistant’s Developer Tools →
            Events to fire each array’s exact event. Send{" "}
            <code>released: false</code> and a supported test value in{" "}
            <code>limit_percent</code> (or <code>limit_w</code> for a
            watts-based action). Then send <code>released: true</code> to
            restore normal operation.
          </p>
          <p style={hintStyle}>
            Check both automation traces to see which actions ran. Separately
            check the inverter’s own applied limit or mode after each event. A
            successful trace shows that Home Assistant ran the action. The
            inverter readback confirms the limit and release took effect. PV
            generation alone can fall below a limit as sunlight changes.
          </p>
          {!enabled && (
            <div
              style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}
            >
              <input
                id={reviewId}
                type="checkbox"
                checked={reviewed}
                disabled={
                  curtailable.length === 0 ||
                  curtailable.some(
                    (array) =>
                      array.controlMode === "stepped" &&
                      array.stepLimitPercent === null,
                  )
                }
                onChange={(event) => onReview(event.target.checked)}
              />
              <label htmlFor={reviewId} style={labelStyle}>
                I reviewed the AC ratings and write modes and verified limit and
                release on every curtailable inverter.
              </label>
            </div>
          )}
        </li>
      </ol>
    </details>
  );
}
