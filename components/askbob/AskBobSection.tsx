"use client";

import type { ReactNode } from "react";

type AskBobSectionProps = {
  id: string;
  children: ReactNode;
};

export default function AskBobSection({ id, children }: AskBobSectionProps) {
  return (
    <section id={id} className="space-y-3">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">{children}</div>
    </section>
  );
}
