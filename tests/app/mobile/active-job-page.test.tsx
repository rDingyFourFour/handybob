import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  createSupabaseState,
  mockGetCurrentWorkspace,
  mockGetJobAskBobSnapshotsForJob,
  mockLoadCallHistoryForJob,
  mockGetLatestCallOutcomeForJob,
  mockGetInvoiceForJob,
} from "@/tests/app/mobile/test-helpers";
import MobileActiveJobPage from "@/app/m/jobs/[id]/page";
import * as nextStepModule from "@/lib/domain/askbob/nextStep";
import { deriveMobileActiveJobInstruction } from "@/lib/domain/mobile/activeJobInstruction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { PROGRESS_STEP_ANCHORS } from "@/lib/domain/askbob/progressSteps";
import { readTrackedLinkButtonEventPayload } from "@/tests/app/mobile/test-helpers";

const JOB_RECORD = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Active job",
  status: "open",
  customer_id: "customer-1",
  customers: { id: "customer-1", name: "Acme Inc." },
};

const STATUS_HINTS = {
  diagnose: jobDetailsCopy.progressStatus.diagnose.pending,
  materials: jobDetailsCopy.progressStatus.materials.pending,
  quote: jobDetailsCopy.progressStatus.quote.pending,
  followup: jobDetailsCopy.progressStatus.followup.pending,
  call: jobDetailsCopy.progressStatus.call.pending,
};

function buildNextStep(overrides: Partial<nextStepModule.NextStepResult>) {
  return {
    stepType: "diagnose" as const,
    rationale: "Test rationale",
    primaryCta: {
      kind: "progress-step" as const,
      label: jobDetailsCopy.nextStepCta.diagnose,
      actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
    },
    statusHints: STATUS_HINTS,
    ...overrides,
  };
}

describe("Mobile active job page", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test", owner_id: "owner-1" },
      role: "owner",
    });
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
    mockGetInvoiceForJob.mockResolvedValue({ invoice: null, error: null });
    const supabaseState = createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com", user_metadata: {} } },
      }),
    };
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderWithNextStep(nextStep: nextStepModule.NextStepResult) {
    const deriveSpy = vi
      .spyOn(nextStepModule, "deriveNextStepForJobDetails")
      .mockImplementation(() => nextStep);
    const element = await MobileActiveJobPage({ params: { id: JOB_RECORD.id } });
    act(() => {
      root?.render(element);
    });
    return deriveSpy;
  }

  it("shows a primary CTA when actionable and a tertiary view details action", async () => {
    const deriveSpy = await renderWithNextStep(
      buildNextStep({
        stepType: "diagnose",
        primaryCta: {
          kind: "progress-step",
          label: jobDetailsCopy.nextStepCta.diagnose,
          actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
        },
      }),
    );
    const primary = container.querySelector('[data-testid="mobile-active-job-primary-cta"]');
    expect(primary).toBeTruthy();
    const tertiary = container.querySelector('[data-testid="mobile-active-job-view-details-cta"]');
    expect(tertiary).toBeTruthy();
    deriveSpy.mockRestore();
  });

  it("does not render a primary CTA when next step is done", async () => {
    const nextStep = buildNextStep({
      stepType: "done",
      primaryCta: null,
    });
    const deriveSpy = await renderWithNextStep(nextStep);
    const primary = container.querySelector('[data-testid="mobile-active-job-primary-cta"]');
    expect(primary).toBeNull();
    const instruction = deriveMobileActiveJobInstruction({
      jobId: JOB_RECORD.id,
      nextStep,
    });
    const content = container.textContent ?? "";
    expect(content).toContain(instruction.recommendation);
    deriveSpy.mockRestore();
  });

  it("routes follow-up, call, and progress anchors correctly", async () => {
    let deriveSpy = await renderWithNextStep(
      buildNextStep({
        stepType: "followup",
        primaryCta: {
          kind: "progress-step",
          label: jobDetailsCopy.nextStepCta.followup,
          actionTarget: PROGRESS_STEP_ANCHORS.followup,
        },
      }),
    );
    const followupCta = container.querySelector('[data-testid="mobile-active-job-primary-cta"]');
    expect(followupCta).not.toBeNull();
    expect(followupCta?.getAttribute("href")).toBe(`/m/follow-up?jobId=${JOB_RECORD.id}`);
    deriveSpy.mockRestore();

    deriveSpy = await renderWithNextStep(
      buildNextStep({
        stepType: "call",
        primaryCta: {
          kind: "navigate",
          label: jobDetailsCopy.nextStepCta.call,
          actionTarget: PROGRESS_STEP_ANCHORS.call,
        },
      }),
    );
    const callCta = container.querySelector('[data-testid="mobile-active-job-primary-cta"]');
    expect(callCta).not.toBeNull();
    expect(callCta?.getAttribute("href")).toBe(`/calls/new?jobId=${JOB_RECORD.id}`);
    deriveSpy.mockRestore();

    deriveSpy = await renderWithNextStep(
      buildNextStep({
        stepType: "diagnose",
        primaryCta: {
          kind: "progress-step",
          label: jobDetailsCopy.nextStepCta.diagnose,
          actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
        },
      }),
    );
    const progressCta = container.querySelector('[data-testid="mobile-active-job-primary-cta"]');
    expect(progressCta).not.toBeNull();
    expect(progressCta?.getAttribute("href")).toBe(
      `/jobs/${JOB_RECORD.id}#${PROGRESS_STEP_ANCHORS.diagnose}`,
    );
    deriveSpy.mockRestore();
  });

  it("renders the instruction recommendation copy", async () => {
    const nextStep = buildNextStep({
      stepType: "diagnose",
      primaryCta: {
        kind: "progress-step",
        label: jobDetailsCopy.nextStepCta.diagnose,
        actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
      },
    });
    await renderWithNextStep(nextStep);
    const instruction = deriveMobileActiveJobInstruction({
      jobId: JOB_RECORD.id,
      nextStep,
    });
    const content = container.textContent ?? "";
    expect(content).toContain(instruction.recommendation);
  });

  it("includes instruction telemetry in the CTA click payload", async () => {
    const nextStep = buildNextStep({
      stepType: "diagnose",
      primaryCta: {
        kind: "progress-step",
        label: jobDetailsCopy.nextStepCta.diagnose,
        actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
      },
    });
    await renderWithNextStep(nextStep);
    const instruction = deriveMobileActiveJobInstruction({
      jobId: JOB_RECORD.id,
      nextStep,
    });
    const primaryCta = container.querySelector('[data-testid="mobile-active-job-primary-cta"]');
    expect(primaryCta).toBeTruthy();
    const { payload, raw } = readTrackedLinkButtonEventPayload(container);
    expect(raw).not.toContain("[object Object]");
    expect(raw).not.toContain("undefined");
    expect(typeof payload).toBe("object");
    expect(payload).not.toBeNull();
    expect(Array.isArray(payload)).toBe(false);
    const requiredInstructionKeys = [
      "instructionStepType",
      "instructionHasPrimaryCta",
      "instructionIsIdle",
      "instructionIsMobile",
      "instructionPrimaryCtaLabel",

    ];
    const missingKeys = requiredInstructionKeys.filter(
      (key) => payload[key] === undefined || payload[key] === null,
    );
    if (missingKeys.length) {
      throw new Error(`Missing instruction telemetry keys: ${missingKeys.join(", ")}`);
    }
    expect(payload.instructionIsMobile).toBe(true);
    expect(payload.instructionPrimaryCtaLabel).toBe(instruction.primaryCta?.label);
    expect(payload.instructionReasonCode).toBe(instruction.telemetry.reasonCode);
    expect(payload.nextStepType).toBe(nextStep.stepType);
  });
});
