import { createPortal } from "react-dom";

export type LoadingIndicatorVariant = "page" | "panel" | "inline" | "button";

export function LoadingIndicator({
  announce = true,
  className,
  label,
  variant = "panel",
}: {
  announce?: boolean;
  className?: string;
  label: string;
  variant?: LoadingIndicatorVariant;
}) {
  const isButtonIndicator = variant === "button";
  const visualIndicator = (
    <span
      className={[
        "loading-indicator",
        `loading-indicator-${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live={announce && !isButtonIndicator ? "polite" : undefined}
      role={announce && !isButtonIndicator ? "status" : undefined}
    >
      <span className="loading-indicator-mark" aria-hidden="true" />
      <span className="loading-indicator-label">{label}</span>
    </span>
  );

  if (!announce || !isButtonIndicator || typeof document === "undefined") {
    return visualIndicator;
  }

  return (
    <>
      {visualIndicator}
      {createPortal(
        <span
          aria-atomic="true"
          aria-live="polite"
          className="loading-indicator-announcement"
          role="status"
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}
