"use client";

import type { ElementType, ReactNode } from "react";
import Link from "next/link";

import HbButton from "@/components/ui/hb-button";

type TrackedLinkButtonProps = {
  href: string;
  eventName: string;
  eventPayload?: Record<string, unknown>;
  children: ReactNode;
  variant?: Parameters<typeof HbButton>[0]["variant"];
  size?: Parameters<typeof HbButton>[0]["size"];
  className?: string;
  as?: ElementType;
} & Omit<React.ComponentProps<typeof HbButton>, "href" | "as" | "variant" | "size" | "className">;

export default function TrackedLinkButton({
  href,
  eventName,
  eventPayload = {},
  children,
  variant = "primary",
  size = "md",
  className,
  as = Link,
  ...props
}: TrackedLinkButtonProps) {
  const handleClick = () => {
    console.log(eventName, eventPayload);
  };

  const payloadString = JSON.stringify(eventPayload);

  return (
    <HbButton
      as={as}
      href={href}
      variant={variant}
      size={size}
      className={className}
      data-event-payload={payloadString}
      onClick={handleClick}
      {...props}
    >
      {children}
    </HbButton>
  );
}
