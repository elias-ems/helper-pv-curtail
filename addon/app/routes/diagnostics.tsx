import DiagnosticsBox from "../components/DiagnosticsBox";
import { pageTitleStyle } from "../components/form";
import { readDiagnostics } from "../lib/diagnostics.server";
import type { Route } from "./+types/diagnostics";

export function loader() {
  return { entries: readDiagnostics() };
}

export default function Diagnostics({ loaderData }: Route.ComponentProps) {
  return (
    <main className="page">
      <h1 style={pageTitleStyle}>Diagnostics</h1>
      <DiagnosticsBox
        initialEntries={loaderData.entries}
        label="Activity log"
        defaultOpen
      />
    </main>
  );
}
