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
    icon: "bg-blue-500/14 text-blue-600 dark:text-blue-300",
    glow: "from-blue-500/30 to-cyan-400/0",
    text: "text-blue-700 dark:text-blue-200"
  },
  emerald: {
    icon: "bg-emerald-500/14 text-emerald-700 dark:text-emerald-300",
    glow: "from-emerald-500/30 to-lime-400/0",
    text: "text-emerald-700 dark:text-emerald-200"
  },
  amber: {
    icon: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
    glow: "from-amber-500/30 to-orange-400/0",
    text: "text-amber-700 dark:text-amber-200"
  },
  violet: {
    icon: "bg-violet-500/14 text-violet-700 dark:text-violet-300",
    glow: "from-violet-500/30 to-fuchsia-400/0",
    text: "text-violet-700 dark:text-violet-200"
  }
};

export function MetricCard({ title, value, meta, icon, tone = "blue" }: MetricCardProps) {
  const toneClass = toneClassMap[tone];
  return (
    <article className="mp-panel relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${toneClass.glow}`} />
      <div
        className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/35 shadow-sm ${toneClass.icon}`}
      >
        {icon}
      </div>
      <p className="text-xs font-semibold tracking-[0.12em] uppercase mp-muted">{title}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-sm font-medium ${toneClass.text}`}>{meta}</p>
    </article>
  );
}
