import { useState } from "react";
import DiagnosticsBox from "../components/DiagnosticsBox";
import Field from "../components/Field";
import ForecastChart from "../components/ForecastChart";
import { formStyle, hintStyle, pageTitleStyle } from "../components/form";
import HomeDeviceStatus from "../components/HomeDeviceStatus";
import EventNameField from "../components/settings/EventNameField";
import Section from "../components/settings/Section";
import TitledCard from "../components/TitledCard";
import type { HomeStatus } from "../lib/home-status";
import type { HomePriceForecast } from "../lib/price-forecast";
import { pvLimitEventType } from "../lib/pv-entities";

const start = Date.UTC(2026, 5, 1);
const hour = 3_600_000;
const forecast: HomePriceForecast = {
  window: { start, tomorrow: start + 24 * hour, end: start + 48 * hour },
  issue: null,
  points: Array.from({ length: 48 }, (_, index) => {
    const market = 0.09 + 0.11 * Math.cos(((index + 5) / 12) * Math.PI);
    return {
      start: start + index * hour,
      end: start + (index + 1) * hour,
      market,
      import: market + 0.125,
      export: market * 0.98 - 0.015,
      verified: index < 24,
      label: `${index < 24 ? "Today" : "Tomorrow"} ${String(index % 24).padStart(2, "0")}:00`,
    };
  }),
};

const status: HomeStatus = {
  running: true,
  connectionError: null,
  devices: [
    {
      key: "grid",
      title: "Grid meter",
      entityId: "sensor.example_grid",
      kind: "Grid",
      reading: -240,
    },
    {
      key: "array",
      title: "South roof",
      entityId: "sensor.example_pv",
      kind: "PV array",
      reading: 2100,
      canLimit: true,
      limitPercent: 42,
    },
    {
      key: "battery",
      title: "Battery",
      entityId: "sensor.example_battery",
      kind: "Battery",
      reading: null,
    },
    {
      key: "ev",
      title: "EV charger",
      entityId: "binary_sensor.example_ev",
      kind: "EV charger",
      reading: true,
    },
  ],
  limits: [
    {
      seq: 2,
      sentAt: "2026-06-01T12:45:00Z",
      timeLabel: "1 Jun, 12:45:00",
      title: "South roof",
      percent: 42,
      watts: 2100,
      released: false,
    },
    {
      seq: 1,
      sentAt: "2026-06-01T12:30:00Z",
      timeLabel: "1 Jun, 12:30:00",
      title: "South roof",
      percent: 100,
      watts: 5000,
      released: true,
    },
  ],
};

export default function Playground() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <main className="page" style={{ display: "grid", gap: "1rem" }}>
      <h1 style={pageTitleStyle}>Component playground</h1>
      <p style={hintStyle}>
        These examples use sample data and save no settings.
      </p>
      <ForecastChart forecast={forecast} />
      <HomeDeviceStatus status={status} />
      <Section
        title="Settings fields"
        add={{
          label: "Show example fields",
          open: addOpen,
          onToggle: () => setAddOpen(!addOpen),
        }}
        description="Use the add button to preview the fields in their expanded state."
      >
        {addOpen && (
          <div style={formStyle}>
            <EventNameField
              defaultValue="South roof"
              savedTitle="South roof"
              placeholder="PV array title"
              noun="PV array"
              carries="generation limit"
              eventType={pvLimitEventType}
            />
            <Field
              name="power"
              label="Rated power (W)"
              type="number"
              defaultValue={5000}
              hint="The inverter’s rated AC output."
            />
            <Field
              name="delay"
              label="Settle time (seconds)"
              type="number"
              defaultValue={-1}
              error="Enter a value of zero or greater."
            />
          </div>
        )}
      </Section>
      <TitledCard title="Diagnostics">
        <DiagnosticsBox
          defaultOpen
          live={false}
          label="Activity log"
          initialEntries={[
            {
              seq: 2,
              at: status.limits[0].sentAt,
              time: "12:45:00",
              origin: "pv-curtailment",
              level: "info",
              message: "South roof → 42%",
              repeat: 1,
            },
            {
              seq: 1,
              at: status.limits[1].sentAt,
              time: "12:30:00",
              origin: "prices",
              level: "warn",
              message: "Waiting for published prices.",
              repeat: 2,
            },
          ]}
        />
      </TitledCard>
    </main>
  );
}
