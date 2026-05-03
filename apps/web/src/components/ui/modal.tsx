import React, { type ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, footer, onClose }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 mp-overlay" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mp-modal-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--ark-line)] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="mp-icon-ghost h-8 w-8" aria-label="关闭" onClick={onClose}>
            x
          </button>
        </header>
        <div className="min-h-0 overflow-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-[var(--ark-line)] px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}
