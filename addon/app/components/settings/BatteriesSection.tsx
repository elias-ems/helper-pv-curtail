import type { Battery } from "../../lib/batteries";
import { failureFor, type SettingsActionData } from "../../lib/settings-form";
import EntityAutocomplete from "../EntityAutocomplete";
import Field from "../Field";
import EditableList from "./EditableList";
import Section from "./Section";
import { useSectionEditor } from "./useSectionEditor";

export default function BatteriesSection({
  batteries,
  actionData,
}: {
  batteries: Battery[];
  actionData?: SettingsActionData;
}) {
  const editor = useSectionEditor(actionData, "battery");
  const failure = failureFor(actionData, "battery");

  return (
    <Section
      title="Battery power sensors"
      description="Optional. Use signed power in watts, positive while charging and negative while discharging."
      add={{
        label: "Add battery power sensor",
        open: editor.showAdd,
        onToggle: () => editor.setShowAdd(!editor.showAdd),
      }}
    >
      <EditableList
        records={batteries}
        intent="battery"
        emptyMessage="No battery sensors configured."
        showAdd={editor.showAdd}
        onCloseAdd={() => editor.setShowAdd(false)}
        editingId={editor.editingId}
        onEdit={editor.setEditingId}
        renderSummary={(battery) => (
          <>
            {battery.title} · <code>{battery.powerEntityId}</code>
          </>
        )}
        renderFields={(battery) => {
          const errors =
            failure && failure.recordId === (battery?.id ?? null)
              ? failure.errors
              : {};
          return (
            <>
              <Field
                name="title"
                label="Name"
                defaultValue={battery?.title}
                error={errors.title}
              />
              <EntityAutocomplete
                name="powerEntityId"
                label="Battery power (W)"
                defaultValue={battery?.powerEntityId}
                error={errors.powerEntityId}
              />
            </>
          );
        }}
      />
    </Section>
  );
}
