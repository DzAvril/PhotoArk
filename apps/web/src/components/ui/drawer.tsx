import React, { type ReactNode } from "react";

export type DrawerProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  side?: "right" | "bottom";
  onClose: () => void;
};

export function Drawer({ open, title, children, side = "right", onClose }: DrawerProps) {
  if (!open) return null;
  const sideClass = side === "bottom" ? "mp-drawer-bottom" : "mp-drawer-right";
  return (
    <div className="fixed inset-0 z-50 mp-overlay" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`mp-drawer-surface ${sideClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--ark-line)] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="mp-icon-ghost h-8 w-8" aria-label="关闭" onClick={onClose}>
            x
          </button>
        </header>
        <div className="min-h-0 overflow-auto p-4">{children}</div>
      </section>
    </div>
  );
}
