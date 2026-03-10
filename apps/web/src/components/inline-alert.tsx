import { useEffect } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type InlineAlertTone = "success" | "error" | "info";

interface InlineAlertProps {
  tone: InlineAlertTone;
  children: ReactNode;
  onClose?: () => void;
  autoCloseMs?: number;
  className?: string;
}

const toneClassByType: Record<InlineAlertTone, string> = {
  success: "border-[var(--ark-success-line)] bg-[var(--ark-success-bg)] text-[var(--ark-success)]",
  error: "border-[var(--ark-danger-line)] bg-[var(--ark-danger-bg)] text-[var(--ark-danger-text)]",
  info: "border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-[var(--ark-ink)]"
};

function iconByTone(tone: InlineAlertTone) {
  if (tone === "success") {
    return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  }
  if (tone === "error") {
    return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
  }
  return <Info className="h-4 w-4" aria-hidden="true" />;
}

export function InlineAlert({ tone, children, onClose, autoCloseMs, className }: InlineAlertProps) {
  useEffect(() => {
    if (!onClose || !autoCloseMs || autoCloseMs <= 0) return;
    const timer = window.setTimeout(() => {
      onClose();
    }, autoCloseMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [autoCloseMs, onClose]);

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${toneClassByType[tone]} ${className ?? ""}`}>
      <span className="mt-0.5 shrink-0">{iconByTone(tone)}</span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-current/80 transition-colors hover:bg-black/5 hover:text-current"
          aria-label="关闭提示"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
