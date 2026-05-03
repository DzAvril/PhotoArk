import React, { type ReactNode } from "react";

export type FieldProps = {
  id: string;
  label: string;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

export function Field({ id, label, help, error, children }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="mp-field">
      <label htmlFor={id} className="mp-field-label">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {help ? (
        <p id={helpId} className="mt-1 text-xs leading-5 mp-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs leading-5 text-[var(--ark-danger-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
