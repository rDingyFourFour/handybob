// Replaces the old `.hb-card` global CSS with a Tailwind-friendly component for HandyBob cards.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const baseClasses = cn(
  "rounded-2xl",
  "border border-slate-800/60",
  "bg-slate-900/60",
  "shadow-sm",
  "p-6",
  "transition-colors hover:border-slate-600",
);

type HbCardProps = {
  children: ReactNode;
  className?: string;
} & JSX.IntrinsicElements["div"];

export default function HbCard({ children, className, ...props }: HbCardProps) {
  return (
    <div className={cn(baseClasses, className)} {...props}>
      {children}
    </div>
  );
}
