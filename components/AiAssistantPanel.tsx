"use client";

import { useActionState } from "react";

type AssistantState = {
  summary?: string;
  follow_up_message?: string;
  next_actions?: string[];
  error?: string;
};

type AssistantAction = (
  prevState: AssistantState | null,
  formData: FormData
) => Promise<AssistantState>;

type Props = {
  title: string;
  description: string;
  action: AssistantAction;
  fieldName: string;
  fieldValue: string;
};

export function AiAssistantPanel({
  title,
  description,
  action,
  fieldName,
  fieldValue,
}: Props) {
  const [state, formAction, pending] = useActionState<AssistantState, FormData>(
    action,
    {} as AssistantState,
  );

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            AI Assistant (suggestions)
          </p>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="hb-muted text-sm">{description} These are editable suggestions.</p>
        </div>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name={fieldName} value={fieldValue} />
          <button className="hb-button" disabled={pending}>
            {pending ? "Thinking..." : "Refresh suggestions"}
          </button>
        </form>
      </div>

      {state?.error ? (
        <p className="text-sm text-red-400">{state.error}</p>
      ) : state ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Summary
            </p>
            <p className="text-sm">{state.summary}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Follow-up draft
            </p>
            <p className="hb-muted text-sm whitespace-pre-line">
              {state.follow_up_message}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Next actions
            </p>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {(state.next_actions ?? []).map((actionItem, index) => (
                <li key={index}>{actionItem}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="hb-muted text-sm">
          Get a quick recap, suggested follow-up, and next steps based on this record.
        </p>
      )}
    </div>
  );
}
