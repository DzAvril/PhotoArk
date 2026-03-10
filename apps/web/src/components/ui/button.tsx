import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "default" | "primary" | "danger";
type ButtonSize = "sm" | "md";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  icon?: ReactNode;
  className?: string;
};

const baseClass = "mp-btn";
const sizeClass: Record<ButtonSize, string> = {
  sm: "mp-btn-sm",
  md: "mp-btn-md"
};

const variantClass: Record<ButtonVariant, string> = {
  default: "",
  primary: "mp-btn-primary",
  danger: "mp-btn-danger"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", busy = false, icon, disabled, children, className, ...props },
  ref
) {
  const isDisabled = Boolean(disabled || busy);
  return (
    <button
      ref={ref}
      type="button"
      aria-busy={busy || undefined}
      disabled={isDisabled}
      className={`${baseClass} ${sizeClass[size]} ${variantClass[variant]} ${className ?? ""}`}
      {...props}
    >
      {icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span> : null}
      {children}
    </button>
  );
});
