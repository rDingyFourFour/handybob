import type { HTMLAttributes } from "react";

"use client";

type CardProps = HTMLAttributes<HTMLDivElement>;

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("hb-card", className)} {...props}>
      {children}
    </div>
  );
}
