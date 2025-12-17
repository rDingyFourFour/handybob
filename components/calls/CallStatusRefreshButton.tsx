"use client";

import { useCallback, useState } from "react";

type CallStatusRefreshButtonProps = {
  callId: string;
};

export default function CallStatusRefreshButton({ callId }: CallStatusRefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    console.log("[calls-session-twilio-status-refresh-click]", { callId });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
    setIsRefreshing(false);
  }, [callId]);

  return (
    <button
      type="button"
      className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-100"
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      {isRefreshing ? "Refreshing..." : "Refresh status"}
    </button>
  );
}
