import type { ReactNode } from "react";
import type { BobInstruction } from "@/lib/domain/bob/bobInstruction";

export type CallSessionMode = "automated" | "manual";

export type PrimaryCtaKind =
  | "start-automated-call"
  | "start-guided-call"
  | "refresh-status"
  | "capture-outcome"
  | "generate-followup"
  | "open-composer"
  | "disabled";

export type PrimaryCta = {
  kind: PrimaryCtaKind;
  label: string;
  disabled?: boolean;
  href?: string;
  workspaceNavigate?: {
    tab: "prepare" | "during" | "after";
    hash: string;
  };
  automatedCallPayload?: {
    workspaceId: string;
    jobId: string;
    customerId: string | null;
    customerPhone: string;
    scriptBody: string;
    scriptSummary: string | null;
    callId?: string;
  } | null;
};

export type CallSessionCtaModel = {
  workspaceId: string;
  callId: string;
  identity: {
    directionLabel: string;
    isInbound: boolean;
    from: string;
    to: string;
    createdLabel: string;
  };
  headerContext: {
    customerName: string | null;
    jobTitle: string | null;
  };
  statusStripItems: CallStatusStripItem[];
  primaryCta: PrimaryCta;
  ctaReasonCode: string;
  instruction: BobInstruction;
  secondaryActions: {
    jobHref: string | null;
    callsHref: string;
    messagesHref: string | null;
  };
  callContext: {
    jobId: string | null;
    customerId: string | null;
  };
  afterCallDraft: {
    body: string | null;
  };
};

export type CallStatusStripItem = {
  key: string;
  label: string;
  status: string;
  timestamp: string;
};

export type CallWorkspacePanel = {
  id: string;
  node: ReactNode;
};
