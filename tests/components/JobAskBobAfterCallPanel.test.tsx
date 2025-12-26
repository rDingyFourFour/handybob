import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRunAction = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("@/app/(app)/askbob/after-call-actions", () => ({
  runAskBobJobAfterCallAction: (...args: unknown[]) => mockRunAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

import { CALL_OUTCOME_CODE_VALUES } from "@/lib/domain/communications/callOutcomes";
import {
  formatLatestCallOutcomeReference,
  type LatestCallOutcomeForJob,
} from "@/lib/domain/calls/latestCallOutcome";
import JobAskBobAfterCallPanel from "@/components/askbob/JobAskBobAfterCallPanel";

const RAW_OUTCOME_TOKENS = [
  "reached",
  "reached_needs_followup",
  "no_answer",
  ...CALL_OUTCOME_CODE_VALUES,
  "left_voicemail",
];

const buildCallOutcome = (
  overrides: Partial<Omit<LatestCallOutcomeForJob, "displayLabel">> = {},
): LatestCallOutcomeForJob => {
  const base: Omit<LatestCallOutcomeForJob, "displayLabel"> = {
    callId: "call_123",
    occurredAt: "2025-01-01T10:00:00Z",
    reachedCustomer: true,
    outcomeCode: "reached_needs_followup",
    outcomeNotes: null,
    isAskBobAssisted: false,
  };
  const normalized = { ...base, ...overrides };
  return {
    ...normalized,
    displayLabel: formatLatestCallOutcomeReference(normalized),
  };
};

describe("JobAskBobAfterCallPanel", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRunAction.mockReset();
    mockRouterPush.mockReset();
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

  it("shows context and disables the CTA when no calls exist", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobAfterCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          latestCallLabel={null}
          hasCall={false}
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Context used: job title, job description");
    expect(container.textContent).toContain("No calls recorded for this job yet.");
    const button = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Summarize"),
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("includes automated call notes in the context display when provided", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobAfterCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          latestCallLabel="Call on Jan 1 · Answered · 3 min"
          hasCall
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
          automatedCallNotesForFollowup="  Live note "
        />,
      );
      await Promise.resolve();
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Context used:");
    expect(text).toContain("automated call notes");
  });

  it("calls the server action and renders the result", async () => {
    mockRunAction.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      callId: "call-1",
      result: {
        afterCallSummary: "Spoke with the customer",
        recommendedActionLabel: "Send prep details",
        recommendedActionSteps: ["Confirm the visit window", "Mention the safety pause"],
        suggestedChannel: "sms",
        urgencyLevel: "high",
        modelLatencyMs: 140,
      },
    });
    const summaryChange = vi.fn();

    await act(async () => {
      root?.render(
        <JobAskBobAfterCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          latestCallLabel="Call on Jan 1 · Answered · 3 min"
          hasCall
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
          onAfterCallSummaryChange={summaryChange}
        />,
      );
      await Promise.resolve();
    });

    const button = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Summarize"),
    );
    if (!button) {
      throw new Error("Summarize button not found");
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockRunAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Summary");
    expect(container.textContent).toContain("Spoke with the customer");
    expect(container.textContent).toContain("Recommended next move");
    expect(container.textContent).toContain("Send prep details");
    expect(summaryChange).toHaveBeenCalledWith("Spoke with the customer");
  });

  it("does not render Previous outcome when it matches Latest call outcome for the same call", async () => {
    const latestOutcome = buildCallOutcome();

    await act(async () => {
      root?.render(
        <JobAskBobAfterCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          latestCallLabel="Call on Jan 1 · Answered · 3 min"
          hasCall
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
          latestCallOutcome={latestOutcome}
          previousCallOutcome={latestOutcome}
        />,
      );
      await Promise.resolve();
    });

    const text = container.textContent ?? "";
    const latestLabel = formatLatestCallOutcomeReference(latestOutcome);
    expect(text).toContain(`Latest call outcome: ${latestLabel}`);
    expect((text.match(/Latest call outcome:/g) ?? []).length).toBe(1);
    expect(text).not.toContain("Previous outcome:");
    for (const token of RAW_OUTCOME_TOKENS) {
      expect(text).not.toContain(token);
    }
  });

  it("renders Previous outcome when it’s truly older/different", async () => {
    const latestOutcome = buildCallOutcome();
    const previousOutcome = buildCallOutcome({
      callId: "call_456",
      occurredAt: "2025-01-01T08:00:00Z",
      reachedCustomer: false,
      outcomeCode: "no_answer_left_voicemail",
    });

    await act(async () => {
      root?.render(
        <JobAskBobAfterCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          latestCallLabel="Call on Jan 1 · Answered · 3 min"
          hasCall
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
          latestCallOutcome={latestOutcome}
          previousCallOutcome={previousOutcome}
        />,
      );
      await Promise.resolve();
    });

    const text = container.textContent ?? "";
    const latestLabel = formatLatestCallOutcomeReference(latestOutcome);
    const previousLabel = formatLatestCallOutcomeReference(previousOutcome);
    expect(text).toContain(`Latest call outcome: ${latestLabel}`);
    expect(text).toContain(`Previous outcome: ${previousLabel}`);
    expect(text.indexOf("Latest call outcome:")).toBeLessThan(text.indexOf("Previous outcome:"));
    for (const token of RAW_OUTCOME_TOKENS) {
      expect(text).not.toContain(token);
    }
  });
});
