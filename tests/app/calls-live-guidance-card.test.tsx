import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { CallLiveGuidanceResult } from "@/lib/domain/askbob/types";

const mockCallLiveGuidanceAction = vi.fn();

const DEFAULT_GUIDANCE_RESULT: CallLiveGuidanceResult = {
  openingLine: "Hello",
  questions: ["Q1"],
  confirmations: ["C1"],
  nextActions: ["A1"],
  guardrails: ["G1"],
  summary: "Focus on the plan and stay concise.",
  phasedPlan: ["Phase 1: Confirm availability", "Phase 2: Confirm permits"],
  nextBestQuestion: "Can we lock in a time now?",
  riskFlags: ["Confirm permits before confirming visit"],
  changedRecommendation: false,
  changedReason: null,
  modelLatencyMs: 5,
  rawModelOutput: null,
};

vi.mock("@/app/(app)/askbob/call-live-guidance-actions", () => ({
  callLiveGuidanceAction: (...args: unknown[]) => mockCallLiveGuidanceAction(...args),
}));

import AskBobLiveGuidanceCard from "@/app/(app)/calls/[id]/AskBobLiveGuidanceCard";

describe("AskBobLiveGuidanceCard", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockCallLiveGuidanceAction.mockReset();
    mockCallLiveGuidanceAction.mockResolvedValue({
      success: true,
      result: DEFAULT_GUIDANCE_RESULT,
    });
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

  function flushReactUpdates(iterations = 5) {
    return act(async () => {
      await Promise.resolve();
      for (let i = 0; i < iterations; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }

  function renderCard() {
    if (!root) {
      throw new Error("missing root");
    }
    act(() => {
      root?.render(
        <AskBobLiveGuidanceCard
          workspaceId="workspace-1"
          callId="call-1"
          customerId="customer-1"
          jobId="job-1"
          direction="inbound"
          fromNumber="+15550001111"
          toNumber="+15550002222"
          customerName="Jane Doe"
          jobTitle="Roof repair"
        />,
      );
    });
  }

  it("disables the generate button until a mode is chosen", async () => {
    renderCard();
    await flushReactUpdates();

    const generateButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='askbob-live-guidance-generate']",
    );
    expect(generateButton).toBeDefined();

    const select = container.querySelector<HTMLSelectElement>("select[name='guidanceMode']");
    act(() => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();
    expect(mockCallLiveGuidanceAction).not.toHaveBeenCalled();

    act(() => {
      if (select) {
        select.value = "intake";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await flushReactUpdates();

    expect(select?.value).toBe("intake");
    act(() => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();
    expect(mockCallLiveGuidanceAction).toHaveBeenCalledTimes(1);
  });

  it("generates, regenerates, and resets the guidance output", async () => {
    const firstCycleResult: CallLiveGuidanceResult = {
      openingLine: "Hello",
      questions: ["Q1"],
      confirmations: ["C1"],
      nextActions: ["A1"],
      guardrails: ["G1"],
      summary: "First summary",
      phasedPlan: ["Phase 1: Confirm availability"],
      nextBestQuestion: "Is Monday still free?",
      riskFlags: ["Verify permits"],
      changedRecommendation: false,
      changedReason: null,
      modelLatencyMs: 5,
      rawModelOutput: null,
    };
    mockCallLiveGuidanceAction.mockResolvedValueOnce({
      success: true,
      result: firstCycleResult,
    });

    renderCard();
    await flushReactUpdates();

    const select = container.querySelector<HTMLSelectElement>("select[name='guidanceMode']");
    const generateButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='askbob-live-guidance-generate']",
    );
    const resetButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='askbob-live-guidance-reset']",
    );

    act(() => {
      if (select) {
        select.value = "scheduling";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.textContent).toContain("Opening line");
    expect(container.textContent).toContain("Q1");
    expect(mockCallLiveGuidanceAction).toHaveBeenCalledTimes(1);

    const secondCycleResult: CallLiveGuidanceResult = {
      openingLine: "Hi again",
      questions: ["Q2"],
      confirmations: ["C2"],
      nextActions: ["A2"],
      guardrails: ["G2"],
      summary: "Second summary",
      phasedPlan: ["Phase 1: Confirm quoting", "Phase 2: Schedule visit"],
      nextBestQuestion: "Can you approve the quote tonight?",
      riskFlags: ["Watch pricing objections"],
      changedRecommendation: true,
      changedReason: "Live notes shifted to pricing focus.",
      modelLatencyMs: 4,
      rawModelOutput: null,
    };
    mockCallLiveGuidanceAction.mockResolvedValueOnce({
      success: true,
      result: secondCycleResult,
    });

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.textContent).toContain("Q2");
    expect(mockCallLiveGuidanceAction).toHaveBeenCalledTimes(2);

    act(() => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.textContent).not.toContain("Q2");
  });
});
