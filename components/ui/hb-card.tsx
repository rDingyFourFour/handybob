// Replaces the old `.hb-card` global CSS with a Tailwind-friendly component for HandyBob cards.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const baseClasses = cn(
  "rounded-2xl",
  "border border-[var(--color-border)]",
  "bg-[var(--color-card)]",
  "shadow-sm shadow-[0_10px_25px_rgba(31,20,15,0.08)]",
  "p-6",
  "transition-colors hover:border-[var(--color-border-strong)]",
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
