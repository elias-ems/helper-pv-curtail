import { type KeyboardEvent, useEffect, useId, useState } from "react";
import {
  DEFAULT_OFFERABLE_DOMAIN,
  type EntitiesData,
  type OfferableDomain,
} from "../lib/entities";
import { useFetchedJson } from "../lib/json-fetch";
import {
  errorStyle,
  fieldStyle,
  hintStyle,
  inputStyle,
  labelStyle,
} from "./form";

type EntityAutocompleteProps = {
  name: string;
  label: string;
  placeholder?: string;
  error?: string;
  /** Shown under the field when there's no error and no load failure to show instead. */
  hint?: string;
  /** Pre-fills the field when editing an entity that already has one. */
  defaultValue?: string;
  /**
   * Called with the field's current value whenever it changes (typing or
   * picking a suggestion), so a caller that shows extra feedback about the
   * *saved* entity — a live reading, a validity check — can tell when that
   * feedback no longer describes what's in the field.
   */
  onValueChange?: (value: string) => void;
  /**
   * Which Home Assistant domain to suggest from. Nearly every field is picking
   * a reading and wants the default; the exception is a field picking a state,
   * which wants `binary_sensor`.
   */
  domain?: OfferableDomain;
};

/** Long enough that typing a sensor name isn't one request per letter. */
const DEBOUNCE_MS = 200;

export default function EntityAutocomplete({
  name,
  label,
  placeholder,
  error,
  hint,
  defaultValue = "",
  onValueChange,
  domain = DEFAULT_OFFERABLE_DOMAIN,
}: EntityAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [selected, setSelected] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputId = useId();
  const listId = `${inputId}-list`;
  const messageId = `${inputId}-message`;

  const value = selected || query;
  // `onValueChange` is a setter from the caller's own state (or omitted
  // entirely), not something that should re-run this effect on its own —
  // only a change to the field's value should notify the caller.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    onValueChange?.(value);
  }, [value]);

  // `error` is whatever the last save attempt came back with, so it stays
  // truthy across re-renders until the next submit resolves it — including
  // the moment right after the user has already picked a different entity.
  // Dismiss it locally the instant the value changes, and let a fresh `error`
  // (a new save attempt) bring it back.
  const [dismissed, setDismissed] = useState(false);
  // This only needs to fire when `error` changes, not use its value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    setDismissed(false);
  }, [error]);
  const activeError = dismissed ? undefined : error;

  // The request is driven by the URL, so the debounce is on the query that
  // builds it rather than on the fetch itself: every keystroke re-renders,
  // only a pause requests.
  const [debounced, setDebounced] = useState(defaultValue);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Not `useFetcher`: a request that fails while somebody is typing is a route
  // error, and a route error would replace the settings page — and everything
  // typed into it — with an error page. See `lib/json-fetch.ts`.
  const { data, failing } = useFetchedJson<EntitiesData>(
    `/api/entities?${new URLSearchParams({ q: debounced, domain })}`,
    { enabled: open },
  );

  const entities = query === debounced ? (data?.entities ?? []) : [];
  const expanded = open && entities.length > 0;
  const activeOption =
    expanded && entities[active] ? `${listId}-${active}` : undefined;

  useEffect(() => {
    if (activeOption)
      document
        .getElementById(activeOption)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  // The loader reports a Home Assistant it couldn't read as a value; `failing`
  // is the other half — the request never reaching the add-on at all.
  const loadError = failing ? "the add-on didn't answer" : data?.error;

  const message =
    activeError ??
    (open && loadError
      ? `Couldn't load Home Assistant entities: ${loadError}. You can still type an entity ID manually.`
      : hint);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function selectEntity(entityId: string) {
    setSelected(entityId);
    setQuery(entityId);
    close();
    setDismissed(true);
  }

  function navigateOptions(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (entities.length) {
        setActive((previous) =>
          previous < 0
            ? direction === 1
              ? 0
              : entities.length - 1
            : Math.max(0, Math.min(entities.length - 1, previous + direction)),
        );
      }
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      selectEntity(entities[active].entityId);
    }
  }

  return (
    <div style={{ ...fieldStyle, position: "relative" }}>
      <label htmlFor={inputId} style={labelStyle}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeOption}
        aria-invalid={Boolean(activeError) || undefined}
        aria-describedby={message ? messageId : undefined}
        onKeyDown={navigateOptions}
        onBlur={close}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected("");
          setActive(-1);
          setOpen(true);
          setDismissed(true);
        }}
        onFocus={() => setOpen(true)}
        style={inputStyle(Boolean(activeError))}
      />
      <input type="hidden" name={name} value={value} />

      {expanded && (
        <ul
          // The ARIA combobox pattern wants exactly this — a ul carrying
          // role=listbox wrapping li role=option. The rule doesn't model the
          // composite widget, so it reads the ul in isolation and objects.
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
          role="listbox"
          id={listId}
          aria-label={label}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 10,
            margin: 0,
            marginTop: "0.25rem",
            padding: "0.25rem",
            listStyle: "none",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: 4,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          {entities.map((entity, index) => (
            // The li is presentational so the listbox's children are the
            // options themselves, which is what the role expects.
            <li key={entity.entityId} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-${index}`}
                tabIndex={-1}
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectEntity(entity.entityId)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.4rem 0.5rem",
                  border: "none",
                  background:
                    active === index ? "var(--color-surface-active)" : "none",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                <div>{entity.name}</div>
                <div style={hintStyle}>
                  {entity.entityId}
                  {entity.unit ? ` · ${entity.unit}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p id={messageId} style={activeError ? errorStyle : hintStyle}>
          {message}
        </p>
      )}
    </div>
  );
}
