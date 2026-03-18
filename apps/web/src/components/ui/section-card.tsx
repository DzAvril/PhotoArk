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
    <Card variant={variant} className={`p-4 md:p-5 ${className ?? ""}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${headerClassName ?? ""}`}>
        <div className="min-w-0">
          <h3 className="mp-h3 font-semibold">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-6 mp-muted">{description}</p> : null}
        </div>
        {right ? <div className="mp-section-actions">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}
