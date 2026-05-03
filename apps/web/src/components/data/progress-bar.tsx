import React from "react";

type ProgressTone = "success" | "warning" | "danger" | "info";

interface ProgressBarProps {
  value: number;
  label: string;
  tone?: ProgressTone;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function ProgressBar({ value, label, tone = "info" }: ProgressBarProps) {
  const clamped = clampProgress(value);

  return (
    <div className="mp-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <span className={`mp-progress-fill mp-progress-fill-${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
