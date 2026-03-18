import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  meta: string;
  icon: ReactNode;
  tone?: "blue" | "emerald" | "amber" | "violet";
}

const toneClassMap: Record<NonNullable<MetricCardProps["tone"]>, { icon: string; glow: string; text: string }> = {
  blue: {
    icon: "bg-[color-mix(in_oklab,var(--ark-primary)_16%,transparent)] text-[var(--ark-primary)]",
    glow: "from-[color-mix(in_oklab,var(--ark-primary)_35%,transparent)] to-transparent",
    text: "text-[var(--ark-primary)]"
  },
  emerald: {
    icon: "bg-[color-mix(in_oklab,var(--ark-success)_16%,transparent)] text-[var(--ark-success)]",
    glow: "from-[color-mix(in_oklab,var(--ark-success)_35%,transparent)] to-transparent",
    text: "text-[var(--ark-success)]"
  },
  amber: {
    icon: "bg-[color-mix(in_oklab,var(--ark-warning)_16%,transparent)] text-[var(--ark-warning)]",
    glow: "from-[color-mix(in_oklab,var(--ark-warning)_35%,transparent)] to-transparent",
    text: "text-[var(--ark-warning)]"
  },
  violet: {
    icon: "bg-[color-mix(in_oklab,var(--ark-accent)_16%,transparent)] text-[var(--ark-accent)]",
    glow: "from-[color-mix(in_oklab,var(--ark-accent)_35%,transparent)] to-transparent",
    text: "text-[var(--ark-accent)]"
  }
};

export function MetricCard({ title, value, meta, icon, tone = "blue" }: MetricCardProps) {
  const toneClass = toneClassMap[tone];
  return (
    <article className="mp-panel relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${toneClass.glow}`} />
      <div
        className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/40 shadow-sm ${toneClass.icon}`}
      >
        {icon}
      </div>
      <p className="mp-kicker">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-xs font-medium ${toneClass.text}`}>{meta}</p>
    </article>
  );
}
