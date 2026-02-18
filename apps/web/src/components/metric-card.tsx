import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  meta: string;
  icon: ReactNode;
}

export function MetricCard({ title, value, meta, icon }: MetricCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-[0_8px_30px_rgba(11,41,33,0.09)] backdrop-blur"
    >
      <div className="mb-4 inline-flex rounded-xl bg-[var(--ark-deep)]/90 p-2 text-[var(--ark-mint)]">{icon}</div>
      <p className="text-sm text-[var(--ark-ink)]/70">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ark-deep)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--ark-ink)]/60">{meta}</p>
    </motion.article>
  );
}
