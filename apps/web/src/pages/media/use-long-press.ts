import { useCallback, useEffect, useRef } from "react";

type LongPressOptions = {
  enabled: boolean;
  thresholdMs: number;
  onActivate: () => void;
  onCancel: () => void;
};

export function useLongPress(options: LongPressOptions) {
  const { enabled, thresholdMs, onActivate, onCancel } = options;
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    clear();
    timerRef.current = window.setTimeout(() => {
      onActivate();
      timerRef.current = null;
    }, thresholdMs);
  }, [clear, enabled, onActivate, thresholdMs]);

  const cancel = useCallback(() => {
    clear();
    if (enabled) {
      onCancel();
    }
  }, [clear, enabled, onCancel]);

  useEffect(() => () => clear(), [clear]);

  return {
    onPointerDown,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    clear
  };
}
