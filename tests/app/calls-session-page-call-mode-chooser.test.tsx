import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CallSessionExperience from "@/app/(app)/calls/[id]/CallSessionExperience";
import type { CallSessionCtaModel } from "@/app/(app)/calls/[id]/callSessionTypes";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";
import { deriveCallSessionInstruction } from "@/lib/domain/calls/callSessionInstruction";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const instructionInputBase = {
  workspaceId: "workspace-1",
  callId: "call-1",
  jobId: "job-1",
  customerId: "customer-1",
};

const unselectedInstruction = deriveCallSessionInstruction({
  ...instructionInputBase,
  mode: "unselected",
  primaryCta: { kind: "disabled", disabled: true },
  ctaReasonCode: "select_call_mode",
});
const automatedInstruction = deriveCallSessionInstruction({
  ...instructionInputBase,
  mode: "automated",
  primaryCta: {
    kind: "start-automated-call",
    disabled: false,
    automatedCallPayload: {
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      customerPhone: "+15550002222",
      scriptBody: "script",
      scriptSummary: "summary",
    },
  },
  ctaReasonCode: "start_automated_call",
});
const manualInstruction = deriveCallSessionInstruction({
  ...instructionInputBase,
  mode: "manual",
  primaryCta: {
    kind: "start-guided-call",
    disabled: false,
    workspaceNavigate: { tab: "during", hash: "#manual-call-tools" },
  },
  ctaReasonCode: "start_guided_call",
});

const baseModel: CallSessionCtaModel = {
  workspaceId: "workspace-1",
  callId: "call-1",
  identity: {
    directionLabel: callSessionCopy.callControl.directionOutbound,
    isInbound: false,
    from: "+15550001111",
    to: "+15550002222",
    createdLabel: "Jan 1",
  },
  headerContext: { customerName: "Test customer", jobTitle: "Test job" },
  statusStripItems: [],
  primaryCta: { kind: "disabled", label: callSessionInstructionCopy.primaryCta.label.disabled },
  ctaReasonCode: "select_call_mode",
  instruction: unselectedInstruction,
  secondaryActions: { jobHref: "/jobs/job-1", callsHref: "/calls", messagesHref: null },
  callContext: { jobId: "job-1", customerId: "customer-1" },
  afterCallDraft: { body: null },
};

const automatedModel: CallSessionCtaModel = {
  ...baseModel,
  primaryCta: {
    ...baseModel.primaryCta,
    kind: "start-automated-call",
    label: callSessionInstructionCopy.primaryCta.label.startAutomated,
    automatedCallPayload: {
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      customerPhone: "+15550002222",
      scriptBody: "script",
      scriptSummary: "summary",
    },
  },
  ctaReasonCode: "start_automated_call",
  instruction: automatedInstruction,
};

const manualModel: CallSessionCtaModel = {
  ...baseModel,
  primaryCta: {
    kind: "start-guided-call",
    label: callSessionInstructionCopy.primaryCta.label.startGuided,
    workspaceNavigate: { tab: "during", hash: "#manual-call-tools" },
  },
  ctaReasonCode: "start_guided_call",
  instruction: manualInstruction,
};

describe("CallSessionExperience mode chooser", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  async function renderExperience() {
    const props = {
      callId: "call-1",
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      headerSubtitle: "Test header",
      directionLabel: callSessionCopy.callControl.directionOutbound,
      isInbound: false,
      fromLabel: "+15550001111",
      toLabel: "+15550002222",
      createdLabel: "Jan 1",
      callSummary: "Sample summary",
      summaryMissing: false,
      customerName: "Customer",
      jobTitle: "Job title",
      jobStatus: "open",
      jobLink: "/jobs/job-1",
      quoteLabel: "Quote 456",
      quoteLink: "/quotes/quote-456",
      quoteStatus: "draft",
      openMessagesHref: "/messages",
      mainStatusLabel: callSessionCopy.statusStrip.labels.status,
      mainStatusValue: callSessionCopy.statusStrip.statuses.created,
      statusBadgeLabel: callSessionCopy.statusStrip.statuses.created,
      statusChips: [
        {
          key: "terminal",
          label: callSessionCopy.statusStrip.labels.terminal,
          value: callSessionCopy.statusStrip.statuses.notYet,
        },
        {
          key: "outcome",
          label: callSessionCopy.statusStrip.labels.outcome,
          value: callSessionCopy.statusStrip.statuses.notYet,
        },
        {
          key: "after-call",
          label: callSessionCopy.statusStrip.labels.afterCall,
          value: callSessionCopy.statusStrip.statuses.notYet,
        },
      ],
      callStatusDetails: <div>status details</div>,
      automatedModel,
      manualModel,
      unselectedModel: baseModel,
      automatedPanels: [],
      manualPanels: [],
      automatedEligible: true,
      manualEligible: true,
      automatedDisabledReason: null,
      manualDisabledReason: null,
      manualFallbackNode: <div>fallback</div>,
      showInProgressBanner: true,
      showOutcomeRequiredBanner: false,
      callOutcomePanel: <div>outcome</div>,
      callFollowUpPanel: <div>follow-up</div>,
      callEnrichmentPanel: <div>enrichment</div>,
      summaryHint: null,
    };

    await act(async () => {
      root?.render(<CallSessionExperience {...props} />);
      await Promise.resolve();
    });
  }

  async function clickModeOption(mode: "automated" | "manual") {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-testid="call-mode-select-${mode}"]`,
    );
    if (!button) {
      throw new Error(`Mode button ${mode} not found`);
    }
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  function expectSinglePrimaryCta(label: string) {
    const primaryCtas = container.querySelectorAll('[data-testid="call-session-primary-cta"]');
    expect(primaryCtas).toHaveLength(1);
    expect(primaryCtas[0]?.textContent ?? "").toContain(label);
  }

  it("renders the mode decision card and disabled CTA initially", async () => {
    await renderExperience();
    expect(container.querySelector('[data-testid="call-mode-decision"]')).toBeTruthy();
    expectSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.disabled);
  });

  it("selects automated mode, stores the selection, and exposes one CTA", async () => {
    await renderExperience();
    await clickModeOption("automated");
    expect(window.sessionStorage.getItem("calls-session-mode:call-1")).toBe("automated");
    expectSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.startAutomated);
  });

  it("selects manual mode, stores the selection, and updates the CTA", async () => {
    await renderExperience();
    await clickModeOption("manual");
    expect(window.sessionStorage.getItem("calls-session-mode:call-1")).toBe("manual");
    expectSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.startGuided);
  });
});
