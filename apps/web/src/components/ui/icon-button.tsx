import React, { type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonVariant = "default" | "primary" | "danger" | "ghost";
type IconButtonSize = "sm" | "md";

const variantClass: Record<IconButtonVariant, string> = {
  default: "mp-btn",
  primary: "mp-btn mp-btn-primary",
  danger: "mp-btn mp-btn-danger",
  ghost: "mp-icon-ghost"
};

const sizeClass: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10"
};

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  ariaLabel: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

export function IconButton({ ariaLabel, icon, variant = "default", size = "md", type = "button", className, ...props }: IconButtonProps) {
  return (
    <button type={type} aria-label={ariaLabel} className={`${variantClass[variant]} ${sizeClass[size]} shrink-0 px-0 ${className ?? ""}`} {...props}>
      <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
    </button>
  );
}
