// Replaces the old `.hb-card` global CSS with a Tailwind-friendly component for HandyBob cards.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const baseClasses = cn(
  "rounded-[var(--theme-radius-lg)]",
  "border border-[var(--theme-divider)]",
  "bg-[var(--theme-card)]",
  "shadow-[var(--theme-shadow)]",
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
