import AppPageLink from "../components/AppPageLink";
import ForecastChart from "../components/ForecastChart";
import { pageTitleStyle } from "../components/form";
import HomeDeviceStatus from "../components/HomeDeviceStatus";
import TitledCard from "../components/TitledCard";
import { isGridConfigured } from "../lib/grid";
import type { HomeStatus } from "../lib/home-status";
import { readHomeStatus } from "../lib/home-status.server";
import { usePolledJson } from "../lib/json-fetch";
import type { HomePriceForecast } from "../lib/price-forecast";
import { readHomePriceForecast } from "../lib/price-source.server";
import { isPriceConfigured } from "../lib/prices";
import { isCurtailable } from "../lib/pv-entities";
import { readSettings } from "../lib/settings-backup.server";
import type { Route } from "./+types/_index";

export async function loader() {
  const [forecast, status, settings] = await Promise.all([
    readHomePriceForecast(),
    readHomeStatus(),
    readSettings(),
  ]);
  const arrays = settings.pvEntities.filter(isCurtailable);
  const setupSteps = [
    ...(!isGridConfigured(settings.grid)
      ? ["Choose a grid power sensor."]
      : []),
    ...(!isPriceConfigured(settings.prices)
      ? ["Select an EPEX Predictor bidding zone."]
      : []),
    ...(arrays.length === 0 ? ["Configure a PV array for curtailment."] : []),
    ...(arrays.some(
      (array) =>
        array.controlMode === "stepped" && array.stepLimitPercent === null,
    )
      ? ["Set a fixed limit for each stepped inverter."]
      : []),
    ...(!settings.curtailment.enabled
      ? ["Verify the inverter automation, then enable curtailment."]
      : []),
  ];
  return { forecast, status, setupSteps };
}

export default function Home({ loaderData }: Route.ComponentProps) {
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
      {loaderData.setupSteps.length > 0 && (
        <TitledCard title="Set up PV curtailment">
          <ul style={{ marginTop: 0, paddingInlineStart: "1.4rem" }}>
            {loaderData.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <AppPageLink to="/settings">Continue setup in Settings</AppPageLink>
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
