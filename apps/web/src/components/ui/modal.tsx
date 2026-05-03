import React, { type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "./dialog-focus";

export type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, footer, onClose }: ModalProps) {
  const titleId = React.useId();
  const { dialogRef, handleDialogKeyDown } = useDialogFocusTrap(open, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 mp-overlay" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="mp-modal-surface"
        onKeyDown={handleDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--ark-line)] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button type="button" className="mp-icon-ghost h-8 w-8" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 overflow-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-[var(--ark-line)] px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}
