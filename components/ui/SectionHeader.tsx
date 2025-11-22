"use client";

import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
};

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="hb-muted text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 text-xs">{actions}</div>}
    </div>
  );
}
