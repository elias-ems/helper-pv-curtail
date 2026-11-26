import { useId, useState } from "react";
import { useNavigation } from "react-router";
import { formatMoney } from "../../lib/formatters";
import { applyFormula } from "../../lib/price-formula";
import {
  PRICE_REGIONS,
  PRICE_SOURCES,
  type PriceConfig,
  type PriceSourceSummary,
} from "../../lib/prices";
import type { SettingsActionData } from "../../lib/settings-form";
import { failureFor, succeededFor } from "../../lib/settings-form";
import {
  errorStyle,
  fieldStyle,
  formStyle,
  hintStyle,
  inputStyle,
  labelStyle,
} from "../form";
import Section from "./Section";
import TrackedSettingsForm from "./TrackedSettingsForm";

/**
 * The formula's result at the current price, worked out in the browser as it is
 * typed.
 *
 * The same `applyFormula` the server will use, which is the whole reason the
 * evaluator lives in a pure module: this is a promise about what will happen
 * rather than a separate implementation that might drift. Nothing is saved
 * until the form is submitted, so a formula can be checked against a real
 * price before it is committed to.
 */
function FormulaPreview({
  formula,
  spotPerKwh,
  currency,
}: {
  formula: string;
  spotPerKwh: number | null;
  currency: string;
}) {
  if (spotPerKwh === null) {
    return (
      <p style={hintStyle}>
        Pick a bidding zone and save to see this worked out against a real
        price.
      </p>
    );
  }

  const result = applyFormula(formula, spotPerKwh);

  return (
    <p style={result.ok ? hintStyle : errorStyle}>
      {result.ok
        ? `${formatMoney(spotPerKwh)} → ${formatMoney(result.value, `${currency}/kWh`)}`
        : result.error}
    </p>
  );
}

/** A formula field: monospaced, with its result underneath as it is typed. */
function FormulaField({
  name,
  label,
  hint,
  defaultValue,
  error,
  summary,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  error?: string;
  summary: PriceSourceSummary;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [formula, setFormula] = useState(defaultValue);

  return (
    <div style={fieldStyle}>
      <label htmlFor={inputId} style={labelStyle}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={formula}
        onChange={(event) => setFormula(event.target.value)}
        style={{ ...inputStyle(Boolean(error)), fontFamily: "monospace" }}
      />
      <p id={hintId} style={hintStyle}>
        {hint}
      </p>
      {error ? (
        <p id={errorId} style={errorStyle}>
          {error}
        </p>
      ) : (
        <FormulaPreview
          formula={formula}
          spotPerKwh={summary.spotPerKwh}
          currency={summary.currency}
        />
      )}
    </div>
  );
}

export default function PricesSection({
  config,
  summary,
  actionData,
}: {
  config: PriceConfig;
  /** What the server made of the configured bidding zone, on the last load. */
  summary: PriceSourceSummary;
  actionData?: SettingsActionData;
}) {
  const navigation = useNavigation();
  const errors = failureFor(actionData, "prices")?.errors ?? {};
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "prices-save";

  const sourceId = useId();
  const regionId = useId();
  const [source, setSource] = useState(config.source);
  const [region, setRegion] = useState<string>(config.region);
  const summaryIsCurrent = source === config.source && region === config.region;
  const effectiveSummary: PriceSourceSummary = summaryIsCurrent
    ? summary
    : { ...summary, spotPerKwh: null };

  return (
    <Section
      id="price-settings"
      title="Prices"
      description="Choose a price source and the tariff formulas for grid import and export."
    >
      <TrackedSettingsForm
        method="post"
        style={{ ...formStyle, marginTop: "1rem" }}
        savedAction={
          succeededFor(actionData, "prices") ? actionData : undefined
        }
        actions={(changed) =>
          (changed || isSaving) && (
            <div>
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : "Save prices"}
              </button>
            </div>
          )
        }
      >
        <input type="hidden" name="intent" value="prices-save" />

        <div style={fieldStyle}>
          <label htmlFor={sourceId} style={labelStyle}>
            Source
          </label>
          <select
            id={sourceId}
            name="source"
            aria-invalid={Boolean(errors.source) || undefined}
            aria-describedby={errors.source ? `${sourceId}-error` : undefined}
            value={source}
            onChange={(event) =>
              setSource(event.target.value as PriceConfig["source"])
            }
            style={inputStyle(Boolean(errors.source))}
          >
            {PRICE_SOURCES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.source && (
            <p id={`${sourceId}-error`} style={errorStyle}>
              {errors.source}
            </p>
          )}
        </div>

        {source === "none" && (
          <>
            <input
              type="hidden"
              name="consumptionFormula"
              value={config.consumptionFormula}
            />
            <input
              type="hidden"
              name="productionFormula"
              value={config.productionFormula}
            />
          </>
        )}

        {source === "epex-predictor" && (
          <>
            <div style={fieldStyle}>
              <label htmlFor={regionId} style={labelStyle}>
                Country or bidding zone
              </label>
              <select
                id={regionId}
                name="region"
                aria-invalid={Boolean(errors.region) || undefined}
                aria-describedby={
                  errors.region ? `${regionId}-error` : undefined
                }
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                style={inputStyle(Boolean(errors.region))}
              >
                <option value="">Select a bidding zone</option>
                {Object.entries(PRICE_REGIONS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.region && (
                <p id={`${regionId}-error`} style={errorStyle}>
                  {errors.region}
                </p>
              )}
            </div>

            {summaryIsCurrent && (
              <>
                <p style={summary.ok ? hintStyle : errorStyle}>
                  {summary.detail}
                </p>
                {summary.spot && (
                  <p style={hintStyle}>
                    Now: market {summary.spot} · consumption{" "}
                    {summary.consumption} · production {summary.production}
                  </p>
                )}
              </>
            )}

            <FormulaField
              name="consumptionFormula"
              label="Grid import price formula"
              hint="Arithmetic over `price`, the market price per kWh. e.g. ((price * 1.02) + 0.1272) * 1.06 for a slope, a fixed charge and VAT. `min` and `max` are available."
              defaultValue={config.consumptionFormula}
              error={errors.consumptionFormula}
              summary={effectiveSummary}
            />

            <FormulaField
              name="productionFormula"
              label="Grid export price formula"
              hint="Usually a different formula. e.g. max(price * 0.98 - 0.015, 0) to take a cut and never go below zero, or just 0.05 for a fixed injection tariff."
              defaultValue={config.productionFormula}
              error={errors.productionFormula}
              summary={effectiveSummary}
            />
          </>
        )}
      </TrackedSettingsForm>
    </Section>
  );
}
