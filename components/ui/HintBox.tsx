"use client";

import { useEffect, useState } from "react";

export interface HintBoxProps {
  id: string;
  title?: string;
  children: React.ReactNode;
}

const storagePrefix = "hb-hint-dismissed";

export function HintBox({ id, title, children }: HintBoxProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`${storagePrefix}:${id}`);
    if (stored === "true") {
      setDismissed(true);
    }
  }, [id]);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${storagePrefix}:${id}`, "true");
    }
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="relative space-y-1 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 text-sm text-slate-300">
      {title && <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{title}</p>}
      <div>{children}</div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-[11px] text-slate-500 underline-offset-2 transition hover:text-slate-400"
      >
        Dismiss
      </button>
    </div>
  );
}
