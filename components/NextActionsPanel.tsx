"use client";

import { useActionState } from "react";

type NextActionsState = {
  next_actions?: string[];
  error?: string;
};

type NextActionsAction = (
  prevState: NextActionsState | null,
  formData: FormData
) => Promise<NextActionsState>;

type Props = {
  jobId: string;
  action: NextActionsAction;
};

export function NextActionsPanel({ jobId, action }: Props) {
  const [state, formAction, pending] = useActionState<NextActionsState, FormData>(action, null);

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            Next actions (AI suggestions)
          </p>
          <h2 className="text-lg font-semibold">Suggested next actions</h2>
          <p className="hb-muted text-sm">
            Read-only suggestions; no status changes or auto-sends. Always review.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="job_id" value={jobId} />
          <button className="hb-button" disabled={pending}>
            {pending ? "Refreshing..." : "Refresh suggestions"}
          </button>
        </form>
      </div>

      {state?.error && (
        <p className="text-sm text-red-400">Could not load next actions: {state.error}</p>
      )}

      <ul className="list-disc space-y-1 pl-4 text-sm">
        {(state?.next_actions ?? []).length === 0 ? (
          <li className="hb-muted">No suggestions yet. Refresh to fetch actions.</li>
        ) : (
          (state?.next_actions ?? []).map((item, index) => <li key={index}>{item}</li>)
        )}
      </ul>
    </div>
  );
}
