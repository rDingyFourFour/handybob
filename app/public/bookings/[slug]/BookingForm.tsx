"use client";

import { useFormState, useFormStatus } from "react-dom";

import { submitPublicBooking, type ActionState } from "./actions";

type Props = {
  workspaceSlug: string;
  workspaceName: string;
};

const initialState: ActionState = { status: "idle", errors: {}, message: null, successName: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="hb-button min-w-[180px]" type="submit" disabled={pending}>
      {pending ? "Sending..." : "Send request"}
    </button>
  );
}

export function BookingForm({ workspaceSlug, workspaceName }: Props) {
  const [state, formAction] = useFormState(
    submitPublicBooking.bind(null, workspaceSlug),
    initialState
  );

  if (state.status === "success") {
    return (
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-semibold text-slate-50">
          Thanks {state.successName || "there"}, we’ve received your request for {workspaceName}.
        </h2>
        <p className="hb-muted">
          We’ll review it and get back to you soon — most requests are answered within a few business hours.
        </p>
      </div>
    );
  }

  return (
    <form key={state.status} action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="hb-label" htmlFor="name">Full name *</label>
          <input id="name" name="name" className="hb-input bg-slate-950/40 border-slate-800" />
          {state.errors?.name && <p className="text-xs text-rose-300 mt-1">{state.errors.name}</p>}
        </div>
        <div>
          <label className="hb-label" htmlFor="email">Email *</label>
          <input id="email" name="email" type="email" className="hb-input bg-slate-950/40 border-slate-800" />
          {state.errors?.email && <p className="text-xs text-rose-300 mt-1">{state.errors.email}</p>}
        </div>
      </div>

      <div>
        <label className="hb-label" htmlFor="phone">Phone (optional, recommended)</label>
        <input id="phone" name="phone" className="hb-input bg-slate-950/40 border-slate-800" placeholder="+1 (555) 123-4567" />
      </div>

      <div>
        <label className="hb-label" htmlFor="address">Address (optional)</label>
        <input id="address" name="address" className="hb-input bg-slate-950/40 border-slate-800" placeholder="Street, city" />
      </div>

      <div>
        <label className="hb-label" htmlFor="description">How can we help? *</label>
        <textarea
          id="description"
          name="description"
          className="hb-textarea bg-slate-950/40 border-slate-800"
          rows={5}
          placeholder="Describe the work, location in the home, and any details that help us prepare."
        />
        {state.errors?.description && (
          <p className="text-xs text-rose-300 mt-1">{state.errors.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="hb-label">Desired timing</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: "today", label: "Emergency" },
            { value: "this_week", label: "This week" },
            { value: "flexible", label: "Flexible" },
            { value: "specific_date", label: "Specific date" },
          ].map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
            >
              <input type="radio" name="urgency" value={option.value} defaultChecked={option.value === "this_week"} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="hb-label" htmlFor="specific_date">If specific date, add it here</label>
        <input id="specific_date" name="specific_date" type="date" className="hb-input bg-slate-950/40 border-slate-800" />
      </div>

      <div className="hidden">
        <label htmlFor="website">Do not fill this field</label>
        <input id="website" name="website" autoComplete="off" />
      </div>

      {state.message && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
          {state.message}
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
