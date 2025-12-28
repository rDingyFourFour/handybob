"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { submitPublicBooking, type ActionState } from "./actions";
import { PublicBookingConfirmation } from "./PublicBookingConfirmation";

type Props = {
  workspaceSlug: string;
  workspaceName: string;
};

const initialState: ActionState = {
  status: "idle",
  errors: {},
  message: null,
  errorCode: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="hb-button min-w-[180px]" type="submit" disabled={pending}>
      {pending ? "Sending..." : "Send request"}
    </button>
  );
}

export function BookingForm({ workspaceSlug }: Props) {
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="space-y-4" data-testid="public-booking-form-wrapper">
      <BookingFormContent
        key={resetKey}
        workspaceSlug={workspaceSlug}
        onReset={() => setResetKey((value) => value + 1)}
      />
    </div>
  );
}

type BookingFormContentProps = {
  workspaceSlug: string;
  onReset: () => void;
};

function BookingFormContent({ workspaceSlug, onReset }: BookingFormContentProps) {
  const [state, formAction] = useActionState(
    submitPublicBooking.bind(null, workspaceSlug),
    initialState
  );
  const router = useRouter();
  const confirmationLoggedRef = useRef<string | null>(null);
  const ownerHandoffLoggedRef = useRef<string | null>(null);
  const lastSubmitAtRef = useRef<number | null>(null);
  const pendingRef = useRef(false);

  function PendingTracker() {
    const { pending } = useFormStatus();
    useEffect(() => {
      pendingRef.current = pending;
    }, [pending]);
    return null;
  }

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }
    const logKey = `${state.jobId}:${state.customerId}`;
    if (confirmationLoggedRef.current === logKey) {
      return;
    }
    confirmationLoggedRef.current = logKey;
    console.log("[public-booking-confirmation-visible]", {
      workspaceId: state.workspaceId,
      jobId: state.jobId,
      customerId: state.customerId,
      ownerHandoffEligible: state.ownerHandoff.eligible,
    });
  }, [state]);

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }
    if (!state.ownerHandoff.eligible || !state.ownerHandoff.redirectPath) {
      return;
    }
    const logKey = `${state.jobId}:${state.customerId}:handoff`;
    if (ownerHandoffLoggedRef.current === logKey) {
      return;
    }
    ownerHandoffLoggedRef.current = logKey;
    console.log("[public-booking-owner-handoff-visible]", {
      workspaceId: state.workspaceId,
      jobId: state.jobId,
      customerId: state.customerId,
      redirectPath: state.ownerHandoff.redirectPath,
    });
  }, [state]);

  function handleOwnerHandoff() {
    if (state.status !== "success" || !state.ownerHandoff.redirectPath) {
      return;
    }
    const redirectPath = state.ownerHandoff.redirectPath;
    console.log("[public-booking-owner-handoff-click]", {
      workspaceId: state.workspaceId,
      jobId: state.jobId,
      customerId: state.customerId,
      redirectPath,
    });
    try {
      router.replace(redirectPath);
      console.log("[public-booking-owner-handoff-navigate]", {
        workspaceId: state.workspaceId,
        jobId: state.jobId,
        customerId: state.customerId,
        redirectPath,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      console.warn("[public-booking-owner-handoff-failure]", {
        workspaceId: state.workspaceId,
        jobId: state.jobId,
        reason,
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const now = Date.now();
    const lastSubmitAt = lastSubmitAtRef.current;
    const withinWindow = lastSubmitAt != null && now - lastSubmitAt < 1500;
    if (pendingRef.current || withinWindow) {
      event.preventDefault();
      event.stopPropagation();
      console.log("[public-booking-submit-rapid-click-ignored]", {
        workspaceSlug,
      });
      return;
    }
    lastSubmitAtRef.current = now;
  }

  if (state.status === "success") {
    return (
      <PublicBookingConfirmation
        jobId={state.jobId}
        customerId={state.customerId}
        ownerHandoff={state.ownerHandoff}
        onOwnerHandoff={handleOwnerHandoff}
        onReset={onReset}
      />
    );
  }

  const displayMessage =
    state.errorCode === "bookings_disabled"
      ? "Bookings are currently disabled for this business."
      : state.message;

  return (
    <form action={formAction} className="space-y-4" onSubmit={handleSubmit}>
      <PendingTracker />
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

      {displayMessage && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
          {displayMessage}
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
