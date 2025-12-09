"use client";

type JobAskBobHudProps = {
  lastTaskLabel?: string | null;
  lastUsedAtDisplay?: string | null;
  lastUsedAtIso?: string | null;
  runsSummary?: string | null;
};

export default function JobAskBobHud({
  lastTaskLabel,
  lastUsedAtDisplay,
  lastUsedAtIso,
  runsSummary,
}: JobAskBobHudProps) {
  const placeholder = "No AskBob activity recorded yet for this job.";
  const hasSummary = Boolean(lastTaskLabel && lastUsedAtDisplay);
  const runsText = runsSummary ? `${runsSummary} for this job so far` : "AskBob runs for this job so far";
  const activityLine = hasSummary
    ? `Last AskBob activity: ${lastTaskLabel} (${lastUsedAtDisplay}) · ${runsText}`
    : placeholder;
  const titleAttr = hasSummary && lastUsedAtIso ? lastUsedAtIso : undefined;
  const scopeHint = hasSummary
    ? "AskBob can help you with diagnosis, materials, quotes, and follow-ups for this job. Everything stays editable until you save it."
    : null;

  // TODO: Enhance this HUD with richer AskBob metadata once we track usage details.
  return (
    <div
      className="rounded-2xl border border-slate-800/60 bg-slate-950/50 px-3 py-2 text-xs text-slate-400"
      title={titleAttr}
    >
      <div>{activityLine}</div>
      {scopeHint && <div className="text-[10px] text-slate-500">{scopeHint}</div>}
    </div>
  );
}
