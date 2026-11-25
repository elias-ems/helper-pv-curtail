import AppPageLink from "../components/AppPageLink";
import ForecastChart from "../components/ForecastChart";
import { hintStyle, pageTitleStyle } from "../components/form";
import { curtailmentLoopStatus } from "../lib/control-loop.server";
import { readHomePriceForecast } from "../lib/price-source.server";
import type { Route } from "./+types/_index";

export async function loader() {
  return {
    ...curtailmentLoopStatus(),
    forecast: await readHomePriceForecast(),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="page">
      <h1 style={pageTitleStyle}>Home</h1>
      <p style={hintStyle}>
        {loaderData.running
          ? "Curtailment is enabled."
          : "Curtailment is disabled."}{" "}
        <AppPageLink to="/settings">Configure curtailment</AppPageLink>
      </p>
      <ForecastChart initial={loaderData.forecast} />
    </main>
  );
}
