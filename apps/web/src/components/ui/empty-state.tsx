import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={`mp-panel mp-panel-soft p-4 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-[var(--ark-ink-soft)]">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ark-ink)]">{title}</p>
          {description ? <p className="mt-1 text-sm leading-6 mp-muted">{description}</p> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
