import { Link } from "react-router";
import DiagnosticsBox from "../components/DiagnosticsBox";
import { hintStyle, pageTitleStyle } from "../components/form";
import { curtailmentLoopStatus } from "../lib/control-loop.server";
import { readDiagnostics } from "../lib/diagnostics.server";
import type { Route } from "./+types/_index";

export function loader() {
  return { ...curtailmentLoopStatus(), entries: readDiagnostics() };
}

export default function Status({ loaderData }: Route.ComponentProps) {
  return (
    <main className="page">
      <h1 style={pageTitleStyle}>PV curtailment</h1>
      <p style={hintStyle}>
        {loaderData.running
          ? "Curtailment is enabled."
          : "Curtailment is disabled."}{" "}
        <Link to="/settings">Configure curtailment</Link>
      </p>
      <DiagnosticsBox initialEntries={loaderData.entries} defaultOpen />
    </main>
  );
}
