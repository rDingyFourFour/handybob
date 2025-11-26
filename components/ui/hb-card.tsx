// Replaces the old `.hb-card` global CSS with a Tailwind-friendly component for HandyBob cards.
import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

// TEMP: loud styles to visually confirm HbCard usage
const baseClasses =
  "w-full rounded-2xl border-4 border-amber-400 bg-emerald-900/80 shadow-lg p-6 shadow-amber-900/60";

type HbCardProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
};

export default function HbCard({
  children,
  className,
  as = "div",
  ...props
}: HbCardProps & Omit<HTMLAttributes<HTMLElement>, "className">) {
  const Component = as as ElementType;
  return (
    <Component className={cn(baseClasses, className)} {...props}>
      {children}
    </Component>
  );
}
