import type { ReactNode } from "react";
import { Card } from "./card";
import type { CardVariant } from "./card";

type SectionCardProps = {
  variant?: CardVariant;
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
};

export function SectionCard({ variant = "panel", title, description, right, children, className, headerClassName }: SectionCardProps) {
  return (
    <Card variant={variant} className={`p-4 ${className ?? ""}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${headerClassName ?? ""}`}>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? <p className="mt-1 text-sm mp-muted">{description}</p> : null}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2 text-sm">{right}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}
