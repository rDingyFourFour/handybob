import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

const baseSnapshot = {
  recommendedAction: "Call the customer",
  rationale: "Need to confirm availability",
  steps: [],
  shouldSendMessage: false,
  shouldScheduleVisit: false,
  shouldCall: true,
  shouldWait: false,
  modelLatencyMs: 0,
};

describe("JobAskBobFollowupPanel", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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

  it("shows the call suggestion hint and CTA when a call is recommended", async () => {
    const onJump = vi.fn();

    await act(async () => {
      root?.render(
        <JobAskBobFollowupPanel
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
          resetToken={0}
          onReset={vi.fn()}
          onFollowupCompleted={vi.fn()}
          onFollowupResult={vi.fn()}
          hasQuoteContextForFollowup={false}
          onJumpToCallAssist={onJump}
          stepCompleted={false}
          onFollowupSummaryUpdate={vi.fn()}
          initialFollowupSnapshot={{
            ...baseSnapshot,
            callRecommended: true,
            callPurpose: "Explain quote and get a decision",
            callTone: "friendly and confident",
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("AskBob suggests a phone call");
    expect(container.textContent).toContain("Purpose: Explain quote and get a decision");
    const button = findButton(container, "Use AskBob to prep this call");
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it("hides the call CTA when a call is not recommended", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobFollowupPanel
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          stepCollapsed={false}
          onToggleStepCollapsed={vi.fn()}
          resetToken={0}
          onReset={vi.fn()}
          onFollowupCompleted={vi.fn()}
          onFollowupResult={vi.fn()}
          hasQuoteContextForFollowup={false}
          stepCompleted={false}
          onFollowupSummaryUpdate={vi.fn()}
          initialFollowupSnapshot={{
            ...baseSnapshot,
            callRecommended: false,
            callPurpose: null,
            callTone: null,
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("AskBob suggests a phone call");
    const button = findButton(container, "Use AskBob to prep this call");
    expect(button).toBeUndefined();
  });
});
