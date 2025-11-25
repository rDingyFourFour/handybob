"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { OutboundSmsStatus } from "@/lib/domain/sms";

type SmsActionButtonProps<Args extends Record<string, unknown>> = {
  action: (args: Args) => Promise<OutboundSmsStatus>;
  args: Args;
  label: string;
  buttonClassName?: string;
  disabled?: boolean;
  successMessage?: string;
  errorMessage?: string;
};

export function SmsActionButton<Args extends Record<string, unknown>>({
  action,
  args,
  label,
  buttonClassName = "hb-button-ghost",
  disabled,
  successMessage,
  errorMessage,
}: SmsActionButtonProps<Args>) {
  const router = useRouter();
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (disabled || isPending) return;
    startTransition(async () => {
      setStatus(null);
      const result = await action(args);
      if (result.ok) {
        setStatus({ type: "success", message: successMessage ?? "SMS sent successfully." });
        router.refresh();
      } else {
        setStatus({
          type: "error",
          message: errorMessage ?? result.error ?? "Couldn’t send SMS, please check the number.",
        });
      }
    });
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`${buttonClassName} ${isPending ? "opacity-60 pointer-events-none" : ""}`}
        disabled={disabled || isPending}
        onClick={handleClick}
      >
        {isPending ? "Sending..." : label}
      </button>
      {status && (
        <p className={`text-[12px] ${status.type === "success" ? "text-emerald-400" : "text-amber-300"}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
