import React, { type ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  chips?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, chips, actions }: PageHeaderProps) {
  return (
    <header className="mp-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="mp-kicker mp-kicker-primary">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[26px] font-semibold leading-tight md:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 mp-muted">{description}</p> : null}
        {chips ? <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div> : null}
      </div>
      {actions ? <div className="mp-page-header-actions">{actions}</div> : null}
    </header>
  );
}
