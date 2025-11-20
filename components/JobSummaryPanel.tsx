"use client";

import { useActionState } from "react";

type JobSummaryState = {
  summary?: string;
  error?: string;
};

type JobSummaryAction = (
  prevState: JobSummaryState | null,
  formData: FormData
) => Promise<JobSummaryState>;

type Props = {
  jobId: string;
  action: JobSummaryAction;
};

export function JobSummaryPanel({ jobId, action }: Props) {
  const [state, formAction, pending] = useActionState<JobSummaryState, FormData>(
    action,
    {} as JobSummaryState,
  );

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            Job AI Summary (AI-generated)
          </p>
          <h2 className="text-lg font-semibold">Generate summary</h2>
          <p className="hb-muted text-sm">
            Summarize what this job is, what&apos;s been done, what&apos;s outstanding, and any special customer notes. Review before using.
          </p>
        </div>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="job_id" value={jobId} />
          <button className="hb-button" disabled={pending}>
            {pending ? "Generating..." : "Generate summary"}
          </button>
        </form>
      </div>

      {state?.error && (
        <p className="text-sm text-red-400">Sorry, we couldn&apos;t generate a summary. {state.error}</p>
      )}

      {state?.summary ? (
        <p className="text-sm whitespace-pre-line">{state.summary}</p>
      ) : (
        <p className="hb-muted text-sm">
          No summary yet. Click “Generate summary” to fetch an AI-written recap. These are suggestions—edit freely.
        </p>
      )}
    </div>
  );
}
