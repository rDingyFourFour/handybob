"use client";

export type AskBobStepReadiness = {
  isReady: boolean;
  blockingReason?: string | null;
  hint?: string | null;
};

type AskBobStepReadinessBadgeProps = {
  readiness?: AskBobStepReadiness | null;
  className?: string;
};

export default function AskBobStepReadinessBadge({
  readiness,
  className = "",
}: AskBobStepReadinessBadgeProps) {
  if (!readiness) {
    return null;
  }
  const label = readiness.isReady
    ? "Ready"
    : `Not ready${readiness.blockingReason ? `: ${readiness.blockingReason}` : ""}`;
  const toneClass = readiness.isReady ? "text-emerald-200" : "text-amber-300";
  return (
    <div className={`flex flex-col gap-1 ${className}`.trim()}>
      <span className={`text-[11px] uppercase tracking-[0.3em] ${toneClass}`.trim()}>
        {label}
      </span>
      {readiness.hint && (
        <span className="text-xs text-slate-500">{readiness.hint}</span>
      )}
    </div>
  );
}
