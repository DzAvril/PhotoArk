import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "panel" | "panelSoft" | "panelHero" | "subtle" | "plain";

export type { CardVariant };

export type CardProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  variant?: CardVariant;
  children: ReactNode;
};

const variantClass: Record<CardVariant, string> = {
  panel: "mp-panel",
  panelSoft: "mp-panel mp-panel-soft",
  panelHero: "mp-panel mp-panel-hero",
  subtle: "mp-subtle-card",
  plain: "mp-card"
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ variant = "panel", className, children, ...props }, ref) {
  return (
    <div ref={ref} className={`${variantClass[variant]} ${className ?? ""}`} {...props}>
      {children}
    </div>
  );
});
