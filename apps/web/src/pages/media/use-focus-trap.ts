import { useEffect } from "react";

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function useFocusTrap(options: {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const { enabled, containerRef, initialFocusRef, restoreFocusRef } = options;

  useEffect(() => {
    if (!enabled) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => initialFocusRef?.current?.focus());

    function onKeydown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const dialog = containerRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (e.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", onKeydown);
      restoreFocusRef?.current?.focus();
    };
  }, [enabled, containerRef, initialFocusRef, restoreFocusRef]);
}
