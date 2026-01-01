// Replaces the old `.hb-card` global CSS with a Tailwind-friendly component for HandyBob cards.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const baseClasses = cn(
  "rounded-[var(--mobile-card-radius,var(--theme-card-radius))]",
  "border border-[var(--mobile-card-border,var(--theme-card-border))]",
  "bg-[var(--mobile-card-bg,var(--theme-card-bg))]",
  "shadow-[var(--mobile-card-shadow,var(--theme-card-shadow))]",
  "p-[var(--mobile-card-padding,var(--theme-card-padding))]",
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
