import { useEffect } from "react";
import type { ReactNode } from "react";

type InlineAlertTone = "success" | "error" | "info";

interface InlineAlertProps {
  tone: InlineAlertTone;
  children: ReactNode;
  onClose?: () => void;
  autoCloseMs?: number;
  className?: string;
}

const toneClassByType: Record<InlineAlertTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700"
};

function iconByTone(tone: InlineAlertTone) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="m6.8 10.1 2.2 2.2 4.3-4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M10 6.4v4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="10" cy="13.9" r="0.95" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 9v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="10" cy="6.4" r="0.95" fill="currentColor" />
    </svg>
  );
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
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-current/80 transition-colors hover:bg-black/5 hover:text-current"
          aria-label="关闭提示"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
