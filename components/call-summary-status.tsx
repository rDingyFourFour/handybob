"use client";

import { useEffect, useState } from "react";

type CallSummaryStatusProps = {
  callId: string;
  initialStatus: "needed" | "recorded";
};

export default function CallSummaryStatus({
  callId,
  initialStatus,
}: CallSummaryStatusProps) {
  const [status, setStatus] = useState<"needed" | "recorded">(initialStatus);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ callId: string; status: "needed" | "recorded" }>;
      if (customEvent.detail?.callId !== callId) {
        return;
      }
      setStatus(customEvent.detail.status);
    };

    window.addEventListener("handybob:callSummaryStatus", handler);
    return () => window.removeEventListener("handybob:callSummaryStatus", handler);
  }, [callId]);

  const label = status === "needed" ? "Summary needed" : "Summary recorded";
  const classes =
    status === "needed"
      ? "border-amber-200 bg-amber-100/20 text-amber-200"
      : "border-emerald-200 bg-emerald-100/20 text-emerald-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${classes}`}
    >
      {label}
    </span>
  );
}
