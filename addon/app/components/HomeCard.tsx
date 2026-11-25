import { type ReactNode, useId } from "react";
import { cardStyle, headingStyle } from "./form";

export default function HomeCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} style={{ ...headingStyle, marginBottom: "0.5rem" }}>
        {title}
      </h2>
      <div style={cardStyle}>{children}</div>
    </section>
  );
}
