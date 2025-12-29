"use client";

type JobAskBobHudProps = {
  activityLine: string;
  scopeHint?: string | null;
  activityLineTitle?: string | null;
};

export default function JobAskBobHud({
  activityLine,
  scopeHint,
  activityLineTitle,
}: JobAskBobHudProps) {
  return (
    <div
      className="rounded-2xl border border-slate-800/60 bg-slate-950/50 px-3 py-2 text-xs text-slate-400"
      title={activityLineTitle ?? undefined}
    >
      <div>{activityLine}</div>
      {scopeHint && <div className="text-[10px] text-slate-500">{scopeHint}</div>}
    </div>
  );
}
