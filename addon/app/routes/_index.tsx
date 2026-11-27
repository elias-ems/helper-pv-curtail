import { useEffect, useId, useState } from "react";
import { data, Form, useNavigation } from "react-router";
import ForecastChart from "../components/ForecastChart";
import {
  errorStyle,
  linkButtonStyle,
  pageTitleStyle,
} from "../components/form";
import HomeDeviceStatus from "../components/HomeDeviceStatus";
import PvCurtailmentChecklist from "../components/settings/PvCurtailmentChecklist";
import TitledCard from "../components/TitledCard";
import { withCurtailmentPaused } from "../lib/control-loop.server";
import { saveCurtailmentConfig } from "../lib/curtailment-config.server";
import type { HomeStatus } from "../lib/home-status";
import { readHomeStatus } from "../lib/home-status.server";
import { usePolledJson } from "../lib/json-fetch";
import type { HomePriceForecast } from "../lib/price-forecast";
import { readHomePriceForecast } from "../lib/price-source.server";
import {
  missingPvSetup,
  pvActivationError,
  pvReviewKey,
} from "../lib/pv-onboarding";
import { readSettings } from "../lib/settings-backup.server";
import type { Route } from "./+types/_index";

const setupCollapsedKey = "elias-ems-pv-curtailment.setup-collapsed";

export async function loader() {
  const [forecast, status, settings] = await Promise.all([
    readHomePriceForecast(),
    readHomeStatus(),
    readSettings(),
  ]);
  const missing = missingPvSetup(settings);
  const { enabled } = settings.curtailment;
  return {
    forecast,
    status,
    onboarding:
      enabled && !missing.length
        ? null
        : { arrays: settings.pvEntities, enabled, missing },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  return withCurtailmentPaused(async () => {
    const settings = await readSettings();
    if (settings.curtailment.enabled) return { error: null };
    const error = pvActivationError(settings, form.get("pvReview"), false);
    if (error) return data({ error }, { status: 400 });
    await saveCurtailmentConfig({ ...settings.curtailment, enabled: true });
    return { error: null };
  });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const setupBodyId = useId();
  useEffect(() => {
    try {
      setSetupCollapsed(localStorage.getItem(setupCollapsedKey) === "true");
    } catch {
      // Storage may be blocked in an embedded panel.
    }
  }, []);

  function toggleSetup() {
    const collapsed = !setupCollapsed;
    setSetupCollapsed(collapsed);
    try {
      localStorage.setItem(setupCollapsedKey, String(collapsed));
    } catch {
      // The toggle still works on this page.
    }
  }

  const navigation = useNavigation();
  const { onboarding } = loaderData;
  const reviewKey = onboarding ? pvReviewKey(onboarding.arrays) : null;
  const reviewed = reviewKey !== null && reviewKey === reviewedKey;
  const forecast = usePolledJson<HomePriceForecast>("/api/price-forecast", {
    intervalMs: 60_000,
    leading: false,
  });
  const status = usePolledJson<HomeStatus>("/api/home-status", {
    intervalMs: 5_000,
    hiddenIntervalMs: 30_000,
    leading: false,
  });
  return (
    <main className="page" style={{ display: "grid", gap: "1rem" }}>
      <h1 style={pageTitleStyle}>Home</h1>
      {onboarding && (
        <TitledCard
          title="Set up PV curtailment"
          bodyId={setupBodyId}
          collapsed={setupCollapsed}
          actions={
            <button
              type="button"
              aria-controls={setupBodyId}
              aria-expanded={!setupCollapsed}
              onClick={toggleSetup}
              style={linkButtonStyle("var(--color-link)")}
            >
              {setupCollapsed ? "Expand setup" : "Collapse setup"}
            </button>
          }
        >
          {onboarding.missing.length > 0 && (
            <ul style={{ paddingInlineStart: "1.4rem" }}>
              {onboarding.missing.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <PvCurtailmentChecklist
            arrays={onboarding.arrays}
            enabled={onboarding.enabled}
            reviewed={reviewed}
            onReview={(confirmed) =>
              setReviewedKey(confirmed ? reviewKey : null)
            }
            homeReadings={{
              status: status.data ?? loaderData.status,
              prices: forecast.data ?? loaderData.forecast,
              failing: status.failing || forecast.failing,
            }}
          />
          {!onboarding.enabled && (
            <Form method="post">
              <input
                type="hidden"
                name="pvReview"
                value={reviewed ? reviewKey : ""}
              />
              <button
                type="submit"
                className="primary-button"
                disabled={
                  !reviewed ||
                  onboarding.missing.length > 0 ||
                  navigation.state !== "idle"
                }
              >
                Enable PV curtailment
              </button>
              {actionData?.error && (
                <p role="alert" style={errorStyle}>
                  {actionData.error}
                </p>
              )}
            </Form>
          )}
        </TitledCard>
      )}
      <ForecastChart
        forecast={forecast.data ?? loaderData.forecast}
        failing={forecast.failing}
        storageKey="elias-ems-pv-curtailment.price-type"
      />
      <HomeDeviceStatus
        status={status.data ?? loaderData.status}
        failing={status.failing}
      />
    </main>
  );
}
