import { useEffect } from "react";

type PreviewHotkeyActions = {
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleLive: () => void;
};

export function usePreviewHotkeys(
  enabled: boolean,
  options: {
    hasLivePair: boolean;
    actions: PreviewHotkeyActions;
  }
) {
  const { hasLivePair, actions } = options;

  useEffect(() => {
    if (!enabled) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") actions.onClose();
      if (e.key === "ArrowLeft") actions.onPrev();
      if (e.key === "ArrowRight") actions.onNext();
      if ((e.key === " " || e.key.toLowerCase() === "l") && hasLivePair) {
        e.preventDefault();
        actions.onToggleLive();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [enabled, hasLivePair, actions]);
}
