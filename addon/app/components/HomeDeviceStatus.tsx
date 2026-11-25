import { formatWatts } from "../lib/formatters";
import type { HomeDevice, HomeStatus } from "../lib/home-status";

import AppPageLink from "./AppPageLink";
import { hintStyle } from "./form";
import TitledCard from "./TitledCard";

function deviceReading({ reading }: HomeDevice): string {
  if (reading === null) return "Unavailable";
  if (typeof reading === "boolean") return reading ? "Charging" : "Idle";
  return formatWatts(reading);
}

export default function HomeDeviceStatus({
  status,
  failing = false,
}: {
  status: HomeStatus;
  failing?: boolean;
}) {
  const { running, devices, limits, connectionError } = status;

  return (
    <>
      {(failing || connectionError) && (
        <p role="status" style={hintStyle}>
          {failing
            ? "Device and limit updates are temporarily unavailable."
            : "Could not read devices from Home Assistant."}
        </p>
      )}
      <TitledCard
        title="PV Curtailment"
        actions={
          <p style={hintStyle}>
            {running ? "Curtailment is enabled." : "Curtailment is disabled."}{" "}
            <AppPageLink to="/settings">Configure curtailment</AppPageLink>
          </p>
        }
      >
        {limits.length === 0 ? (
          <p style={hintStyle}>No limits sent since the app started.</p>
        ) : (
          <ul className="home-status-list">
            {limits.map((limit) => (
              <li key={limit.seq}>
                <div style={{ overflowWrap: "anywhere", minWidth: 0 }}>
                  <strong>{limit.title}</strong>
                  <p style={hintStyle}>
                    <time dateTime={limit.sentAt}>{limit.timeLabel}</time>
                  </p>
                </div>
                <span>
                  {limit.released ? "Released" : "Limit sent"} · {limit.percent}
                  % ({formatWatts(limit.watts)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </TitledCard>
      <TitledCard title="Linked devices">
        {devices.length === 0 ? (
          <p style={hintStyle}>No devices linked yet.</p>
        ) : (
          <ul className="home-status-list">
            {devices.map((device) => (
              <li key={device.key}>
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <strong>{device.title}</strong>
                  <p style={hintStyle}>
                    {device.kind} · {device.entityId}
                  </p>
                </div>
                <div style={{ marginInlineStart: "auto", textAlign: "end" }}>
                  <strong>{deviceReading(device)}</strong>
                  {device.kind === "PV array" && (
                    <p style={hintStyle}>
                      {!device.canLimit
                        ? "Readings only"
                        : device.limitPercent === undefined
                          ? "No current limit"
                          : `Last limit sent ${device.limitPercent}%`}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </TitledCard>
    </>
  );
}
