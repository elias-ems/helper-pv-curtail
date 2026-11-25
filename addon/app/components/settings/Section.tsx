import type { ReactNode } from "react";
import { hintStyle } from "../form";
import TitledCard from "../TitledCard";

type SectionProps = {
  id?: string;
  title: string;
  description?: string;
  /** When given, the header carries a `+` toggle for that section's add form. */
  add?: {
    label: string;
    open: boolean;
    onToggle: () => void;
  };
  children: ReactNode;
};

export default function Section({
  id,
  title,
  description,
  add,
  children,
}: SectionProps) {
  return (
    <TitledCard
      id={id}
      title={title}
      actions={
        add && (
          <button
            type="button"
            onClick={add.onToggle}
            aria-label={add.label}
            title={add.label}
            aria-expanded={add.open}
            style={{
              width: "2rem",
              height: "2rem",
              flex: "none",
              borderRadius: "999px",
              border: "1px solid var(--color-border-strong)",
              background: add.open
                ? "var(--color-surface-active)"
                : "var(--color-surface)",
              fontSize: "1.25rem",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            +
          </button>
        )
      }
    >
      {description && (
        // A card can be wider than a paragraph wants to be, so the sentence
        // stops at a readable measure instead of running the card's width.
        <p style={{ ...hintStyle, marginTop: "0.35rem", maxWidth: "62ch" }}>
          {description}
        </p>
      )}
      {children}
    </TitledCard>
  );
}
