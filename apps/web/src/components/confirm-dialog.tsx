import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => confirmButtonRef.current?.focus());

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (event.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = previousBodyOverflow;
      lastFocusedRef.current?.focus();
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="mp-panel w-full max-w-md p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold">
          {title}
        </h3>
        <p id={descriptionId} className="mt-2 text-sm mp-muted">
          {description}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="mp-btn" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button ref={confirmButtonRef} type="button" className="mp-btn mp-btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? "处理中..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
