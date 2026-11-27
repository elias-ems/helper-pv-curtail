import { useCallback } from "react";

export function useCardFlash() {
  return useCallback((element: HTMLElement) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const backgroundColor = getComputedStyle(element).backgroundColor;
    const pulse = { backgroundColor: "var(--color-surface-active)" };
    const rest = { backgroundColor };
    const animation = element.animate(
      [
        { ...rest, offset: 0 },
        { ...pulse, offset: 0.12 },
        { ...rest, offset: 0.42 },
        { ...rest, offset: 0.55 },
        { ...pulse, offset: 0.67 },
        { ...rest, offset: 1 },
      ],
      { duration: 460 },
    );
    return () => animation.cancel();
  }, []);
}
