import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type HbButtonVariant = "primary" | "secondary" | "ghost";
type HbButtonSize = "sm" | "md";

const baseClasses =
  "inline-flex items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

const variantClasses: Record<HbButtonVariant, string> = {
  primary:
    "bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:bg-slate-600 disabled:text-slate-400",
  secondary:
    "border border-slate-300/20 text-slate-100 bg-slate-900/50 hover:border-slate-200 hover:bg-slate-900",
  ghost: "text-slate-300 hover:text-slate-100",
};

const sizeClasses: Record<HbButtonSize, string> = {
  sm: "px-3 py-1 text-sm leading-tight",
  md: "px-4 py-2 text-base",
};

type HbButtonProps = {
  children: ReactNode;
  variant?: HbButtonVariant;
  size?: HbButtonSize;
  as?: ElementType;
} & Omit<React.ButtonHTMLAttributes<HTMLElement>, "className">;

export default function HbButton({
  children,
  variant = "primary",
  size = "md",
  as = "button",
  className,
  ...props
}: HbButtonProps) {
  const Component = as as ElementType;
  return (
    <Component
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
