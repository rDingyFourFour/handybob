/* Legacy backup of HbCard before the CSS refresh. */
// Replaces the old `.hb-card` global CSS with a Tailwind-friendly component for HandyBob cards.
import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const baseClasses = cn(
  "rounded-[32px]",
  "border-4 border-lime-400",
  "bg-fuchsia-900",
  "p-6",
);

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
