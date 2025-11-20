"use client";

import { useActionState } from "react";

type CustomerSummaryState = {
  summary?: string;
  error?: string;
};

type CustomerSummaryAction = (
  prevState: CustomerSummaryState | null,
  formData: FormData
) => Promise<CustomerSummaryState>;

type Props = {
  customerId: string;
  action: CustomerSummaryAction;
};

export function CustomerSummaryPanel({ customerId, action }: Props) {
  const [state, formAction, pending] = useActionState<CustomerSummaryState, FormData>(action, null);

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            Customer AI Summary (AI-generated)
          </p>
          <h2 className="text-lg font-semibold">Relationship overview</h2>
          <p className="hb-muted text-sm">
            Summarizes jobs, communications, tone, and payment behavior for this customer. Review before using.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="customer_id" value={customerId} />
          <button className="hb-button" disabled={pending}>
            {pending ? "Generating..." : "Generate summary"}
          </button>
        </form>
      </div>

      {state?.error && (
        <p className="text-sm text-red-400">Could not generate summary. {state.error}</p>
      )}

      {state?.summary ? (
        <p className="text-sm whitespace-pre-line">{state.summary}</p>
      ) : (
        <p className="hb-muted text-sm">
          No summary yet. Generate to get a high-level relationship overview.
        </p>
      )}
    </div>
  );
}
