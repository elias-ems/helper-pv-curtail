import { useNavigation } from "react-router";
import type { Grid } from "../../lib/grid";
import type { SettingsActionData } from "../../lib/settings-form";
import { failureFor, succeededFor } from "../../lib/settings-form";
import EntityAutocomplete from "../EntityAutocomplete";
import { formStyle } from "../form";
import Section from "./Section";
import TrackedSettingsForm from "./TrackedSettingsForm";

export default function GridSection({
  grid,
  actionData,
}: {
  grid: Grid;
  actionData?: SettingsActionData;
}) {
  const navigation = useNavigation();
  const errors = failureFor(actionData, "grid")?.errors ?? {};
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "grid-save";

  return (
    <Section
      title="Grid"
      description="One sensor, instantaneous power in W and signed: positive while the house draws from the grid, negative while it feeds back. That is the net exchange the strategies balance. If your meter publishes separate consumption and production sensors, subtract one from the other in a Home Assistant template sensor and point this at that."
    >
      <TrackedSettingsForm
        method="post"
        style={{ ...formStyle, marginTop: "1rem" }}
        savedAction={succeededFor(actionData, "grid") ? actionData : undefined}
        actions={(changed) =>
          (changed || isSaving) && (
            <div>
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : "Save grid"}
              </button>
            </div>
          )
        }
      >
        <input type="hidden" name="intent" value="grid-save" />
        <EntityAutocomplete
          name="powerEntityId"
          label="Power — net grid exchange (W)"
          placeholder="e.g. sensor.grid_power"
          defaultValue={grid.powerEntityId}
          error={errors.powerEntityId}
        />
      </TrackedSettingsForm>
    </Section>
  );
}
