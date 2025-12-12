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

import JobAskBobAfterCallPanel from "@/components/askbob/JobAskBobAfterCallPanel";

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
      root.unmount();
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
});
