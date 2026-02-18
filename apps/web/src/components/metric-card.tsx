import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  meta: string;
  icon: ReactNode;
}

export function MetricCard({ title, value, meta, icon }: MetricCardProps) {
  return (
    <article className="mp-panel p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ark-primary)]/10 text-[var(--ark-primary)]">
        {icon}
      </div>
      <p className="text-xs mp-muted">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs mp-muted">{meta}</p>
    </article>
  );
}
