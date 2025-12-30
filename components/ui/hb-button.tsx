import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type HbButtonVariant = "primary" | "secondary" | "ghost";
type HbButtonSize = "sm" | "md";

const baseClasses =
  "inline-flex items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-paper)] shadow-[var(--theme-shadow)]";

const variantClasses: Record<HbButtonVariant, string> = {
  primary:
    "bg-[var(--theme-button-primary-bg)] text-[var(--theme-button-primary-text)] hover:bg-[var(--theme-button-primary-dark)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-secondary)]",
  secondary:
    "border border-[var(--theme-divider)] text-[var(--color-text-primary)] bg-[var(--theme-card-elevated)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-card)] disabled:border-[var(--theme-divider)] disabled:text-[var(--color-text-secondary)]",
  ghost: "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:ring-transparent",
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
