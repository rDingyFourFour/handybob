// HandyBob list primitives – shared styles for jobs/customers/etc.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type HbListProps = {
  children: ReactNode;
  className?: string;
};

export function HbListRoot({ children, className }: HbListProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-xl border border-slate-800/60 bg-slate-950/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HbListHeader({ children, className }: HbListProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-slate-800/40 px-4 py-3 text-xs uppercase tracking-[0.3em] text-slate-400",
        className,
      )}
    >
      {children}
    </div>
  );
}

type HbListCellProps = {
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
};

export function HbListHeaderCell({ children, className }: HbListCellProps) {
  return (
    <div className={cn("flex-1 truncate font-semibold text-slate-300", className)}>
      {children}
    </div>
  );
}

type HbListRowProps = HbListProps & {
  as?: ElementType;
};

export function HbListRow({
  children,
  className,
  as,
  ...props
}: HbListRowProps & React.HTMLAttributes<HTMLElement>) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn(
        "flex items-center gap-4 border-b border-slate-800/50 px-4 py-2 hover:bg-slate-900/70 transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function HbListCell({ children, className, align = "left" }: HbListCellProps) {
  return (
    <div
      className={cn(
        "flex-1 truncate text-sm text-slate-100",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </div>
  );
}
