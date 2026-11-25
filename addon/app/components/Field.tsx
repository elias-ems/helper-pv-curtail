import { useId } from "react";
import {
  errorStyle,
  fieldStyle,
  hintStyle,
  inputStyle,
  labelStyle,
} from "./form";

type FieldProps = {
  name: string;
  label: string;
  type?: "text" | "number";
  placeholder?: string;
  defaultValue?: string | number;
  error?: string;
  /** Shown under the field when there's no error to show instead. */
  hint?: string;
  min?: number;
  max?: number;
  step?: number | "any";
};

/**
 * A labelled input. `useId` rather than deriving the id from `name`: the same
 * field appears once per battery row plus once in the add form, so a
 * name-derived id would be duplicated across the page and the labels would all
 * point at whichever input rendered first.
 */
export default function Field({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue,
  error,
  hint,
  min,
  max,
  step,
}: FieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  return (
    <div style={fieldStyle}>
      <label htmlFor={inputId} style={labelStyle}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? messageId : undefined}
        type={type}
        autoComplete="off"
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        style={inputStyle(Boolean(error))}
      />
      {error ? (
        <p id={messageId} style={errorStyle}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} style={hintStyle}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
