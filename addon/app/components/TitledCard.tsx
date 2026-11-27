import { type ReactNode, useId } from "react";
import { cardStyle, headingStyle } from "./form";

export default function TitledCard({
  id,
  title,
  actions,
  children,
}: {
  id?: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section id={id} tabIndex={id ? -1 : undefined} aria-labelledby={heading}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "0.75rem",
          minHeight: "2rem",
          marginBottom: "0.5rem",
        }}
      >
        <h2 id={heading} style={headingStyle}>
          {title}
        </h2>
        {actions}
      </div>
      <div data-card-body style={cardStyle}>
        {children}
      </div>
    </section>
  );
}
