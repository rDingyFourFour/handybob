import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type HbButtonVariant = "primary" | "secondary" | "ghost";
type HbButtonSize = "sm" | "md";

const baseClasses =
  "inline-flex items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

const variantClasses: Record<HbButtonVariant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-dark)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-paper)]",
  secondary:
    "border border-[var(--color-border)] text-[var(--color-text-primary)] bg-[var(--color-card-elevated)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-card)] disabled:border-[var(--color-border)] disabled:text-[var(--color-text-secondary)]",
  ghost: "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
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
  className?: string;
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
