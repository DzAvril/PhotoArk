import React from "react";
import type { ReactNode } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "",
  success: "mp-chip-success",
  warning: "mp-chip-warning",
  danger: "mp-chip-danger",
  info: "mp-chip-info"
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={["mp-chip", toneClasses[tone]].filter(Boolean).join(" ")}>{children}</span>;
}
