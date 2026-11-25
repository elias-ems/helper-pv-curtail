import ForecastChart from "../components/ForecastChart";
import { pageTitleStyle } from "../components/form";
import HomeDeviceStatus from "../components/HomeDeviceStatus";
import { readHomeStatus } from "../lib/home-status.server";
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
  return (
    <main className="page" style={{ display: "grid", gap: "1rem" }}>
      <h1 style={pageTitleStyle}>Home</h1>
      <ForecastChart initial={loaderData.forecast} />
      <HomeDeviceStatus initial={loaderData.status} />
    </main>
  );
}
