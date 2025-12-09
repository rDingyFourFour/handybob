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
  const summaryParts: string[] = [];
  if (lastTaskLabel) {
    summaryParts.push(lastTaskLabel);
  }
  if (lastUsedAtDisplay) {
    summaryParts.push(lastUsedAtDisplay);
  }

  const hasSummary = summaryParts.length > 0;
  const activityLine = hasSummary
    ? `Last AskBob activity: ${summaryParts.join(" · ")}`
    : placeholder;
  const runsSuffix = hasSummary && runsSummary ? ` (${runsSummary})` : "";
  const content = hasSummary ? `${activityLine}${runsSuffix}` : activityLine;
  const titleAttr = hasSummary && lastUsedAtIso ? lastUsedAtIso : undefined;

  // TODO: Enhance this HUD with richer AskBob metadata once we track usage details.
  return (
    <div
      className="rounded-2xl border border-slate-800/60 bg-slate-950/50 px-3 py-2 text-xs text-slate-400"
      title={titleAttr}
    >
      {content}
    </div>
  );
}
