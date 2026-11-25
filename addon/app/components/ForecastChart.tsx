import { useId } from "react";
import { usePolledJson } from "../lib/json-fetch";
import type { HomePriceForecast } from "../lib/price-forecast";
import { cardStyle, headingStyle, hintStyle } from "./form";

export default function ForecastChart({
  initial,
}: {
  initial: HomePriceForecast;
}) {
  const heading = useId();
  const { data, failing } = usePolledJson<HomePriceForecast>(
    "/api/price-forecast",
    {
      intervalMs: 60_000,
      leading: false,
    },
  );
  const { points, window, issue } = data ?? initial;
  const prices = points.map(({ price }) => price);
  const low = Math.min(0, ...prices);
  const high = Math.max(0, ...prices);
  const range = high - low || 1;
  const x = (time: number) =>
    (100 * (time - window.start)) / (window.end - window.start);
  const y = (price: number) => 5 + (90 * (high - price)) / range;
  const zero = y(0);
  const midnight = x(window.tomorrow);

  return (
    <section
      aria-labelledby={heading}
      style={{ ...cardStyle, marginTop: "1rem" }}
    >
      <h2 id={heading} style={headingStyle}>
        Grid export price
      </h2>
      {points.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `minmax(0, ${midnight}fr) minmax(0, ${100 - midnight}fr)`,
              textAlign: "center",
              marginTop: "0.75rem",
            }}
          >
            <strong>Today</strong>
            <strong>Tomorrow</strong>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content minmax(0, 1fr)",
              gap: "0.5rem",
              marginTop: "0.25rem",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                ...hintStyle,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                textAlign: "right",
              }}
            >
              <span>{high.toFixed(3)}</span>
              {low !== high && <span>{low.toFixed(3)}</span>}
            </div>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label="Grid export prices in EUR per kWh for today and tomorrow"
              style={{
                display: "block",
                width: "100%",
                height: "clamp(10rem, 28vw, 16rem)",
                background: "var(--color-bg)",
              }}
            >
              <line
                x1="0"
                x2="100"
                y1={zero}
                y2={zero}
                stroke="var(--color-border-strong)"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={midnight}
                x2={midnight}
                y1="0"
                y2="100"
                stroke="var(--color-border-strong)"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point) => {
                const top = y(point.price);
                return (
                  <rect
                    key={point.start}
                    x={x(point.start)}
                    y={Math.min(top, zero)}
                    width={(x(point.end) - x(point.start)) * 0.9}
                    height={Math.max(0.7, Math.abs(top - zero))}
                    fill={
                      point.verified
                        ? "var(--color-link)"
                        : "var(--color-chart-bar)"
                    }
                  >
                    <title>
                      {point.label} · {point.price.toFixed(4)} EUR/kWh ·{" "}
                      {point.verified ? "Verified" : "Unverified forecast"}
                    </title>
                  </rect>
                );
              })}
            </svg>
          </div>
          <p
            style={{
              ...hintStyle,
              marginTop: "0.5rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <span>EUR/kWh</span>
            <span>
              <span aria-hidden="true" style={{ color: "var(--color-link)" }}>
                ■
              </span>{" "}
              Verified
            </span>
            <span>
              <span
                aria-hidden="true"
                style={{ color: "var(--color-chart-bar)" }}
              >
                ■
              </span>{" "}
              Unverified forecast
            </span>
          </p>
        </>
      )}
      {(failing || issue) && (
        <p role="status" style={{ ...hintStyle, marginTop: "0.5rem" }}>
          {failing ? "Price chart could not refresh." : issue}
        </p>
      )}
    </section>
  );
}
