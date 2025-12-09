"use client";

import type { ReactNode } from "react";

type AskBobSectionProps = {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export default function AskBobSection({ id, title, description, children }: AskBobSectionProps) {
  return (
    <section id={id} className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {description && <p className="text-sm text-slate-400">{description}</p>}
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">{children}</div>
    </section>
  );
}
