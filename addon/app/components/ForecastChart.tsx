import { useEffect, useId, useState } from "react";
import { usePolledJson } from "../lib/json-fetch";
import type { HomePriceForecast } from "../lib/price-forecast";
import { cardStyle, headingStyle, hintStyle } from "./form";

const priceTypes = {
  market: "Market",
  export: "Export",
  import: "Import",
} as const;
type PriceType = keyof typeof priceTypes;
const storageKey = "elias-ems-pv-curtailment.price-type";

function isPriceType(value: string | null): value is PriceType {
  return value !== null && Object.hasOwn(priceTypes, value);
}

export default function ForecastChart({
  initial,
}: {
  initial: HomePriceForecast;
}) {
  const heading = useId();
  const chartId = useId();
  const selectorId = useId();
  const [priceType, setPriceType] = useState<PriceType>("market");
  const [hovered, setHovered] = useState<number>();
  const [focused, setFocused] = useState<number>();
  const [keyboardSlot, setKeyboardSlot] = useState<number>();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (isPriceType(saved)) setPriceType(saved);
    } catch {
      // Storage may be blocked in an embedded Home Assistant panel.
    }
  }, []);

  function choosePriceType(value: PriceType) {
    setPriceType(value);
    setHovered(undefined);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // The selector still works for the current page.
    }
  }

  const { data, failing } = usePolledJson<HomePriceForecast>(
    "/api/price-forecast",
    {
      intervalMs: 60_000,
      leading: false,
    },
  );
  const { points, window, issue } = data ?? initial;
  const bars = points.flatMap((point) => {
    const price = point[priceType];
    return price === null ? [] : [{ ...point, price }];
  });
  const active = bars.find((bar) => bar.start === (hovered ?? focused));
  const tabStop = bars.find((bar) => bar.start === keyboardSlot) ?? bars[0];
  const prices = bars.map(({ price }) => price);
  const low = Math.min(0, ...prices);
  const high = Math.max(0, ...prices);
  const range = high - low || 1;
  const x = (time: number) =>
    (100 * (time - window.start)) / (window.end - window.start);
  const y = (price: number) => 5 + (90 * (high - price)) / range;
  const zero = y(0);
  const midnight = x(window.tomorrow);
  const priceLabel = priceTypes[priceType];

  return (
    <section
      aria-labelledby={heading}
      style={{ ...cardStyle, marginTop: "1rem" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h2 id={heading} style={headingStyle}>
          Energy prices
        </h2>
        <fieldset className="price-types">
          <legend className="visually-hidden">Price type</legend>
          {(Object.keys(priceTypes) as PriceType[]).map((type) => (
            <label key={type}>
              <input
                className="visually-hidden"
                type="radio"
                name={selectorId}
                value={type}
                checked={priceType === type}
                onChange={() => choosePriceType(type)}
              />
              <span>{priceTypes[type]}</span>
            </label>
          ))}
        </fieldset>
      </div>
      {bars.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content minmax(0, 1fr)",
              gap: "0.5rem",
              marginTop: "0.75rem",
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
                paddingTop: "1.5rem",
              }}
            >
              <span>{high.toFixed(3)}</span>
              {low !== high && <span>{low.toFixed(3)}</span>}
            </div>
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(0, ${midnight}fr) minmax(0, ${100 - midnight}fr)`,
                  textAlign: "center",
                  marginBottom: "0.25rem",
                }}
              >
                <strong>Today</strong>
                <strong>Tomorrow</strong>
              </div>
              <div
                style={{ position: "relative" }}
                onPointerLeave={() => setHovered(undefined)}
              >
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${priceLabel} prices in EUR per kWh for today and tomorrow`}
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
                  {bars.map((bar) => {
                    const top = y(bar.price);
                    const start = x(bar.start);
                    const width = x(bar.end) - start;
                    const selected = active?.start === bar.start;
                    return (
                      <rect
                        key={bar.start}
                        x={start}
                        y={Math.min(top, zero)}
                        width={width * 0.9}
                        height={Math.max(0.7, Math.abs(top - zero))}
                        fill={
                          selected
                            ? "var(--color-chart-now)"
                            : bar.verified
                              ? "var(--color-link)"
                              : "var(--color-chart-bar)"
                        }
                      />
                    );
                  })}
                </svg>
                {bars.map((bar, index) => (
                  <button
                    key={bar.start}
                    id={`${chartId}-${bar.start}`}
                    type="button"
                    className="price-chart-slot"
                    tabIndex={tabStop?.start === bar.start ? 0 : -1}
                    aria-label={`${bar.label}, ${bar.price.toFixed(4)} EUR/kWh, ${bar.verified ? "Published" : "Forecast"}`}
                    style={{
                      left: `${x(bar.start)}%`,
                      width: `${x(bar.end) - x(bar.start)}%`,
                    }}
                    onPointerEnter={() => setHovered(bar.start)}
                    onPointerLeave={() => setHovered(undefined)}
                    onClick={(event) => event.currentTarget.focus()}
                    onFocus={() => {
                      setKeyboardSlot(bar.start);
                      setFocused(bar.start);
                    }}
                    onBlur={() => setFocused(undefined)}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight"
                      )
                        return;
                      event.preventDefault();
                      const next =
                        bars[index + (event.key === "ArrowLeft" ? -1 : 1)];
                      if (next)
                        document
                          .getElementById(`${chartId}-${next.start}`)
                          ?.focus();
                    }}
                  />
                ))}
                {active && (
                  <div
                    aria-hidden="true"
                    className="price-chart-tooltip"
                    style={{
                      left: `clamp(4.75rem, ${x((active.start + active.end) / 2)}%, calc(100% - 4.75rem))`,
                    }}
                  >
                    <span>{active.label}</span>
                    <strong>{active.price.toFixed(4)} EUR/kWh</strong>
                    <span>{active.verified ? "Published" : "Forecast"}</span>
                  </div>
                )}
              </div>
            </div>
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
              Published
            </span>
            <span>
              <span
                aria-hidden="true"
                style={{ color: "var(--color-chart-bar)" }}
              >
                ■
              </span>{" "}
              Forecast
            </span>
          </p>
        </>
      )}
      {(failing || issue || (points.length > 0 && bars.length === 0)) && (
        <p role="status" style={{ ...hintStyle, marginTop: "0.5rem" }}>
          {failing
            ? "Price chart could not refresh."
            : (issue ?? `No ${priceType} prices are available.`)}
        </p>
      )}
    </section>
  );
}
