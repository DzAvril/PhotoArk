import React from "react";
import type { ReactNode } from "react";

type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";

interface MetricTileProps {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  tone?: MetricTone;
}

export function MetricTile({ label, value, description, tone = "neutral" }: MetricTileProps) {
  return (
    <article className={`mp-metric-tile mp-metric-${tone}`}>
      <p className="mp-metric-label">{label}</p>
      <div className="mp-metric-value">{value}</div>
      {description ? <p className="mp-metric-description">{description}</p> : null}
    </article>
  );
}
