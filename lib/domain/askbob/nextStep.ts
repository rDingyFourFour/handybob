"use strict";

import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

export type JobProgressStep = "diagnose" | "materials" | "quote" | "followup" | "call";
export type NextStepType = JobProgressStep | "invoice" | "done";
export type NextStepPrimaryCtaKind = "progress-step" | "navigate";

export type NextStepPrimaryCta = {
  kind: NextStepPrimaryCtaKind;
  label: string;
  actionTarget: string;
};

export type NextStepStatusHints = Record<JobProgressStep, string>;

export type NextStepResult = {
  stepType: NextStepType;
  rationale: string;
  primaryCta: NextStepPrimaryCta | null;
  statusHints: NextStepStatusHints;
};

export type NextStepInput = {
  hasDiagnoseSnapshot: boolean;
  hasMaterialsSnapshot: boolean;
  latestQuoteStatus?: string | null;
  latestQuoteId?: string | null;
  followupSnapshot?: AskBobFollowupSnapshotPayload | null;
  callRecommended?: boolean;
  hasCallWithMissingOutcome?: boolean;
  latestCallOutcomeRecorded?: boolean;
  invoiceStatus?: string | null;
  invoicePresent?: boolean;
};

const normalizeStatus = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const isQuoteAccepted = (status?: string | null) => normalizeStatus(status) === "accepted";

const isInvoiceResolved = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  return normalized === "paid" || normalized === "voided" || normalized === "void";
};

const followupIndicatesAction = (snapshot?: AskBobFollowupSnapshotPayload | null) => {
  if (!snapshot) {
    return false;
  }
  return Boolean(
    snapshot.shouldCall ||
      snapshot.shouldSendMessage ||
      snapshot.shouldScheduleVisit ||
      snapshot.callRecommended,
  );
};

const buildStatusHints = (input: NextStepInput): NextStepStatusHints => {
  const { hasDiagnoseSnapshot, hasMaterialsSnapshot, latestQuoteStatus, followupSnapshot, callRecommended } = input;
  const quoteStatus = normalizeStatus(latestQuoteStatus);
  const quoteHint =
    quoteStatus === "accepted"
      ? jobDetailsCopy.progressStatus.quote.accepted
      : quoteStatus === "sent"
        ? jobDetailsCopy.progressStatus.quote.sent
        : quoteStatus
          ? jobDetailsCopy.progressStatus.quote.drafted
          : jobDetailsCopy.progressStatus.quote.pending;

  return {
    diagnose: hasDiagnoseSnapshot
      ? jobDetailsCopy.progressStatus.diagnose.done
      : jobDetailsCopy.progressStatus.diagnose.pending,
    materials: hasMaterialsSnapshot
      ? jobDetailsCopy.progressStatus.materials.ready
      : jobDetailsCopy.progressStatus.materials.pending,
    quote: quoteHint,
    followup: followupSnapshot
      ? jobDetailsCopy.progressStatus.followup.ready
      : jobDetailsCopy.progressStatus.followup.pending,
    call:
      callRecommended || input.hasCallWithMissingOutcome || input.latestCallOutcomeRecorded
        ? jobDetailsCopy.progressStatus.call.ready
        : jobDetailsCopy.progressStatus.call.pending,
  };
};

const ACTION_TARGETS: Record<JobProgressStep | "invoice" | "call", string> = {
  diagnose: "progress-diagnose",
  materials: "progress-materials",
  quote: "progress-quote",
  followup: "progress-followup",
  call: "call-session",
  invoice: "invoice-section",
};

const buildPrimaryAction = (step: NextStepType): NextStepPrimaryCta | null => {
  if (step === "done") {
    return null;
  }
  const label = jobDetailsCopy.nextStepCta[step as keyof typeof jobDetailsCopy.nextStepCta];
  if (!label) {
    return null;
  }
  if (step === "call" || step === "invoice") {
    return {
      kind: "navigate",
      label,
      actionTarget: ACTION_TARGETS[step],
    };
  }
  return {
    kind: "progress-step",
    label,
    actionTarget: ACTION_TARGETS[step],
  };
};

const buildRationale = (step: NextStepType): string => {
  const fallback = jobDetailsCopy.nextStep.fallbackRationale;
  switch (step) {
    case "diagnose":
      return "AskBob hasn’t produced a diagnosis yet. Understand the job before moving forward.";
    case "materials":
      return "We still need material suggestions so the quote can reflect what’s required.";
    case "quote":
      return "A quote is ready (or nearly ready) for the customer—review and send it to keep momentum.";
    case "followup":
      return "A follow-up plan is available. Share it with the customer to keep the conversation going.";
    case "call":
      return "A call session is the fastest way to capture the outcome and move toward a decision.";
    case "invoice":
      return "The quote was accepted; create an invoice to close out the job.";
    case "done":
      return fallback;
    default:
      return fallback;
  }
};

export function deriveNextStepForJobDetails(input: NextStepInput): NextStepResult {
  const {
    hasDiagnoseSnapshot,
    hasMaterialsSnapshot,
    latestQuoteId,
    latestQuoteStatus,
    followupSnapshot,
    callRecommended,
    hasCallWithMissingOutcome,
    invoiceStatus,
    invoicePresent,
  } = input;

  const quoteExists = Boolean(latestQuoteId);
  const quoteAccepted = isQuoteAccepted(latestQuoteStatus);
  const invoiceResolved = invoicePresent && isInvoiceResolved(invoiceStatus);

  let step: NextStepType = "done";
  if (!hasDiagnoseSnapshot) {
    step = "diagnose";
  } else if (!hasMaterialsSnapshot) {
    step = "materials";
  } else if (!quoteExists || !quoteAccepted) {
    step = "quote";
  } else if (followupIndicatesAction(followupSnapshot)) {
    step = "followup";
  } else if (callRecommended || hasCallWithMissingOutcome) {
    step = "call";
  } else if (!invoicePresent && quoteAccepted) {
    step = "invoice";
  } else if (invoicePresent && !invoiceResolved) {
    step = "invoice";
  }

  const rationale = buildRationale(step);
  return {
    stepType: step,
    rationale: rationale || jobDetailsCopy.nextStep.fallbackRationale,
    primaryCta: buildPrimaryAction(step),
    statusHints: buildStatusHints(input),
  };
}
