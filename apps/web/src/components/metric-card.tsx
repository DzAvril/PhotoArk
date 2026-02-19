import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  meta: string;
  icon: ReactNode;
}

export function MetricCard({ title, value, meta, icon }: MetricCardProps) {
  return (
    <article className="mp-panel relative overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--ark-primary)]/50 to-transparent" />
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ark-primary)]/12 text-[var(--ark-primary)]">
        {icon}
      </div>
      <p className="text-sm mp-muted">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-sm mp-muted">{meta}</p>
    </article>
  );
}
