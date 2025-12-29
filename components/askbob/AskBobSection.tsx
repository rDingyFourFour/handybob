"use client";

import type { ReactNode } from "react";

type AskBobSectionProps = {
  id: string;
  children: ReactNode;
  testId?: string;
};

export default function AskBobSection({ id, children, testId }: AskBobSectionProps) {
  return (
    <section id={id} className="space-y-3" data-testid={testId}>
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        {children}
      </div>
    </section>
  );
}
