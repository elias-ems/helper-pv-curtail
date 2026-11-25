import ForecastChart from "../components/ForecastChart";
import { pageTitleStyle } from "../components/form";
import HomeDeviceStatus from "../components/HomeDeviceStatus";
import type { HomeStatus } from "../lib/home-status";
import { readHomeStatus } from "../lib/home-status.server";
import { usePolledJson } from "../lib/json-fetch";
import type { HomePriceForecast } from "../lib/price-forecast";
import { readHomePriceForecast } from "../lib/price-source.server";
import type { Route } from "./+types/_index";

export async function loader() {
  const [forecast, status] = await Promise.all([
    readHomePriceForecast(),
    readHomeStatus(),
  ]);
  return { forecast, status };
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
