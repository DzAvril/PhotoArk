import React, { type ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export type StateBlockTone = "empty" | "loading" | "error";

export type StateBlockProps = {
  tone?: StateBlockTone;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function StateBlock({ tone = "empty", title, description, action }: StateBlockProps) {
  const Icon = tone === "loading" ? Loader2 : AlertCircle;
  return (
    <div className="mp-state-block">
      <span className="mp-state-icon">
        <Icon className={tone === "loading" ? "h-5 w-5 animate-spin" : "h-5 w-5"} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm leading-6 mp-muted">{description}</p> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
