"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { sendCustomerSmsAction } from "@/app/actions/messages";
import type { CustomerOption, JobOption } from "./types";

type GlobalComposerProps = {
  workspaceId: string;
  customers: CustomerOption[];
  jobs: JobOption[];
  initialCustomerId?: string | null;
  initialJobId?: string | null;
  initialBody?: string | null;
  initialOrigin?: string | null;
  open: boolean;
  onClose?: () => void;
  initialBodyKey?: string | null;
};

type CachedAskBobDraft = {
  body: string;
  createdAtIso: string;
  origin: string;
  jobId?: string | null;
  customerId?: string | null;
  workspaceId?: string | null;
  callId?: string | null;
};

const DRAFT_KEY_TTL_MS = 1000 * 60 * 30;
const DRAFT_KEY_HINT_TEXT = "AskBob’s draft couldn’t be loaded. You can still write a message here.";
export default function GlobalComposer({
  workspaceId,
  customers,
  jobs,
  initialCustomerId,
  initialJobId,
  initialBody,
  initialOrigin,
  open,
  onClose,
  initialBodyKey,
}: GlobalComposerProps) {
  const hasValidInitialCustomer =
    typeof initialCustomerId === "string" &&
    !!initialCustomerId &&
    customers.some((customer) => customer.id === initialCustomerId);
  const effectiveInitialCustomerId = hasValidInitialCustomer ? initialCustomerId : null;
  const jobCandidate = initialJobId ? jobs.find((job) => job.id === initialJobId) : undefined;
  const jobMatchesCustomer =
    Boolean(jobCandidate) &&
    (!effectiveInitialCustomerId || jobCandidate?.customer_id === effectiveInitialCustomerId);
  const initialCustomerFromJob =
    jobMatchesCustomer && jobCandidate?.customer_id ? jobCandidate.customer_id : null;
  const initialCustomerForState = effectiveInitialCustomerId ?? initialCustomerFromJob ?? "";
  const initialJobForState = jobMatchesCustomer ? jobCandidate?.id ?? "" : "";
  const initialBodyValue = initialBody?.trim() ?? "";
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerForState);
  const [selectedJobId, setSelectedJobId] = useState(initialJobForState);
  const [messageBody, setMessageBody] = useState(initialBodyValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const customerSelectId = useId();
  const jobSelectId = useId();
  const bodyTextareaId = useId();
  const [draftKeyHintReason, setDraftKeyHintReason] = useState<string | null>(null);
  const draftKeyHydrationRef = useRef<{ key: string | null; attempted: boolean }>({
    key: null,
    attempted: false,
  });
  const setDraftKeyHint = (value: string | null) => {
    startTransition(() => {
      setDraftKeyHintReason(value);
    });
  };

  const hasInitialBody = initialBodyValue.length > 0;
  const prefillUsed = Boolean(initialCustomerForState || initialJobForState || hasInitialBody);
  const prefillLoggedRef = useRef(false);
  const showAskBobFollowupHint =
    initialOrigin === "askbob-followup" && initialBodyValue.length > 0;
  const showDraftKeyHint = Boolean(draftKeyHintReason);

  useEffect(() => {
    if (!prefillUsed || prefillLoggedRef.current) {
      return;
    }
    console.log("[messages-compose-prefill]", {
      workspaceId,
      initialCustomerId,
      initialJobId,
      hasInitialBody,
      origin: initialOrigin ?? null,
    });
    prefillLoggedRef.current = true;
  }, [prefillUsed, hasInitialBody, initialCustomerId, initialJobId, initialOrigin, workspaceId]);

  const hasCustomers = customers.length > 0;
  const jobsForCustomer = useMemo(
    () =>
      selectedCustomerId
        ? jobs.filter((job) => job.customer_id === selectedCustomerId)
        : [],
    [jobs, selectedCustomerId],
  );

  const handleCustomerChange = (value: string) => {
    setSelectedCustomerId(value);
    setSelectedJobId("");
  };

  const trimmedBody = messageBody.trim();
  const isCustomerSelected = Boolean(selectedCustomerId);
  const canSubmit = hasCustomers && isCustomerSelected && trimmedBody.length > 0;
  const validJobId =
    selectedJobId && jobs.some((job) => job.id === selectedJobId) ? selectedJobId : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isPending) {
      if (!isCustomerSelected) {
        setErrorMessage("Please pick a customer before sending a message.");
      } else if (!trimmedBody) {
        setErrorMessage("Type a short message before sending.");
      }
      return;
    }

    setErrorMessage(null);
    console.info("[messages-compose-submit]", {
      workspaceId,
      customerId: selectedCustomerId,
      jobId: validJobId,
      bodyLength: trimmedBody.length,
    });

    startTransition(async () => {
      try {
        const result = await sendCustomerSmsAction({
          workspaceId,
          customerId: selectedCustomerId,
          jobId: validJobId,
          body: trimmedBody,
          origin: "global",
        });

        if (!result?.ok) {
          setErrorMessage(result?.error ?? "We couldn’t send that SMS. Please try again.");
          return;
        }

        setMessageBody("");
        setSelectedJobId("");
        onClose?.();
        router.refresh();
      } catch (error) {
        console.error("[messages-compose-error] Global composer submit failed:", error);
        setErrorMessage("We couldn’t send that SMS. Please try again.");
      }
    });
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  useEffect(() => {
    if (!open) {
      draftKeyHydrationRef.current = { key: null, attempted: false };
      setDraftKeyHint(null);
      return;
    }
    if (!initialBodyKey) {
      draftKeyHydrationRef.current = { key: null, attempted: false };
      setDraftKeyHint(null);
      return;
    }
    if (
      draftKeyHydrationRef.current.key === initialBodyKey &&
      draftKeyHydrationRef.current.attempted
    ) {
      return;
    }
    draftKeyHydrationRef.current = { key: initialBodyKey, attempted: true };
    const isCallSessionOriginParam = initialOrigin === "call_session_after_call";
    const logBase = {
      origin: initialOrigin ?? null,
      hasDraftKey: true,
      draftKeyPrefix: initialBodyKey.slice(0, 8),
    };
    const clearStoredDraft = () => {
      try {
        window.sessionStorage.removeItem(initialBodyKey);
      } catch (error) {
        console.error("[messages-global-composer] could not clear cached draft", error);
      }
    };
    const shouldSkipOverwrite = messageBody.trim().length > 0 || initialBodyValue.length > 0;
    if (!isCallSessionOriginParam && shouldSkipOverwrite) {
      if (typeof window !== "undefined") {
        clearStoredDraft();
      }
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "skipped_overwrite",
      });
      setDraftKeyHint(null);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    let storedDraft: string | null = null;
    try {
      storedDraft = window.sessionStorage.getItem(initialBodyKey);
    } catch (error) {
      console.error("[messages-global-composer] could not read cached draft", error);
    }
    if (!storedDraft) {
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "not_found",
      });
      setDraftKeyHint("not_found");
      return;
    }
    let payload: CachedAskBobDraft | null = null;
    try {
      payload = JSON.parse(storedDraft);
    } catch {
      clearStoredDraft();
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "parse_error",
      });
      setDraftKeyHint("parse_error");
      return;
    }
    if (!payload || typeof payload.body !== "string" || typeof payload.createdAtIso !== "string") {
      clearStoredDraft();
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "invalid_payload",
      });
      setDraftKeyHint("invalid_payload");
      return;
    }
    const createdAt = Date.parse(payload.createdAtIso);
    if (Number.isNaN(createdAt)) {
      clearStoredDraft();
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "invalid_payload",
      });
      setDraftKeyHint("invalid_payload");
      return;
    }
    if (Date.now() - createdAt > DRAFT_KEY_TTL_MS) {
      clearStoredDraft();
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "expired",
      });
      setDraftKeyHint("expired");
      return;
    }
    if (!payload.body.trim()) {
      clearStoredDraft();
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "invalid_payload",
      });
      setDraftKeyHint("invalid_payload");
      return;
    }
    const isCallSessionPayload = payload.origin === "call_session_after_call";
    if (!isCallSessionPayload && shouldSkipOverwrite) {
      clearStoredDraft();
      console.log("[messages-compose-draftkey-cache-miss]", {
        ...logBase,
        reason: "skipped_overwrite",
      });
      setDraftKeyHint(null);
      return;
    }
    clearStoredDraft();
    console.log("[messages-compose-draftkey-cache-hit]", {
      ...logBase,
      bodyLength: payload.body.length,
    });
    if (isCallSessionPayload) {
      const applied = !shouldSkipOverwrite;
      console.log("[messages-compose-draftkey-origin-call-session]", {
        ...logBase,
        applied,
      });
      if (!applied) {
        setDraftKeyHint(null);
        return;
      }
    }
    startTransition(() => {
      setMessageBody(payload.body);
    });
    setDraftKeyHint(null);
  }, [
    initialBodyKey,
    initialBodyValue,
    initialOrigin,
    messageBody,
    open,
    startTransition,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-compose-title"
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl">
        <HbCard className="space-y-4 p-6">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Messages</p>
            <h2 id="global-compose-title" className="hb-heading-1 text-2xl font-semibold">
              New message
            </h2>
            <p className="text-sm text-slate-400">Send a quick SMS to a customer.</p>
          </header>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <label htmlFor={customerSelectId}>Customer</label>
                <span className="text-slate-400 text-[11px]">Required</span>
              </div>
              <select
                id={customerSelectId}
                name="customerId"
                value={selectedCustomerId}
                onChange={(event) => handleCustomerChange(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                required
                disabled={!hasCustomers}
              >
                <option value="" disabled>
                  Select customer…
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name?.trim() || "(No name)"} · {customer.phone?.trim() || "No phone"}
                  </option>
                ))}
              </select>
              {!hasCustomers && (
                <p className="text-sm text-slate-400">
                  You don’t have any customers yet. Add a customer first to send a message.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <label htmlFor={jobSelectId}>Related job (optional)</label>
                <span className="text-slate-400 text-[11px]">Optional</span>
              </div>
              <select
                id={jobSelectId}
                name="jobId"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                disabled={!isCustomerSelected || jobsForCustomer.length === 0}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">
                  {isCustomerSelected
                    ? jobsForCustomer.length > 0
                      ? "No job selected"
                      : "No jobs for this customer"
                    : "Select a customer first"}
                </option>
                {jobsForCustomer.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title?.trim() || `Job ${job.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <label htmlFor={bodyTextareaId}>Message</label>
                <span className="text-slate-400 text-[11px]">{messageBody.length} characters</span>
              </div>
              <textarea
                id={bodyTextareaId}
                name="body"
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-600"
                rows={4}
              />
              {showAskBobFollowupHint && (
                <p className="text-xs text-slate-400">
                  AskBob drafted this follow-up guidance—review and edit it before sending.
                </p>
              )}
              {showDraftKeyHint && (
                <p className="text-xs text-slate-400">{DRAFT_KEY_HINT_TEXT}</p>
              )}
            </div>
            {errorMessage && <p className="text-xs text-rose-400">{errorMessage}</p>}
            <div className="flex items-center justify-between gap-3">
              <HbButton type="submit" size="sm" disabled={!canSubmit || isPending}>
                {isPending ? "Sending…" : "Send message"}
              </HbButton>
              <button
                type="button"
                className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400 hover:text-slate-100"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </form>
        </HbCard>
      </div>
    </div>
  );
}
