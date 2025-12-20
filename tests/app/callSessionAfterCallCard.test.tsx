import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRunAction = vi.fn();
const mockCacheResult = vi.fn();
const mockCacheDraft = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/app/(app)/askbob/after-call-actions", () => ({
  runAskBobJobAfterCallAction: (...args: unknown[]) => mockRunAction(...args),
}));

vi.mock("@/utils/askbob/afterCallCache", () => ({
  cacheAskBobAfterCallResult: (...args: unknown[]) => mockCacheResult(...args),
}));

vi.mock("@/utils/askbob/messageDraftCache", () => ({
  cacheAskBobMessageDraft: (...args: unknown[]) => mockCacheDraft(...args),
}));

import AskBobAfterCallCard from "@/app/(app)/calls/[id]/AskBobAfterCallCard";
import type {
  CallAutomatedDialSnapshot,
  CallSessionFollowupReadiness,
} from "@/lib/domain/calls/sessions";

describe("AskBobAfterCallCard", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const readyReadiness: CallSessionFollowupReadiness = { isReady: true, reasons: [] };
  const notTerminalReadiness: CallSessionFollowupReadiness = {
    isReady: false,
    reasons: ["not_terminal"],
  };
  const missingOutcomeReadiness: CallSessionFollowupReadiness = {
    isReady: false,
    reasons: ["missing_outcome"],
  };
  const terminalMissingOutcomeSnapshot: CallAutomatedDialSnapshot = {
    callId: "call-1",
    workspaceId: "workspace-1",
    twilioCallSid: null,
    twilioStatus: "completed",
    twilioStatusUpdatedAt: null,
    isTerminal: true,
    isInProgress: false,
    hasRecordingMetadata: false,
    hasRecordingReady: false,
    hasTranscriptOrNotes: false,
    hasOutcome: false,
    hasOutcomeNotes: false,
    reachedCustomer: null,
  };
  const terminalReadySnapshot: CallAutomatedDialSnapshot = {
    ...terminalMissingOutcomeSnapshot,
    hasOutcome: true,
    hasOutcomeNotes: true,
    reachedCustomer: true,
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRunAction.mockReset();
    mockCacheResult.mockReset();
    mockCacheDraft.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
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

  it("disables the generate button when no script or notes exist", () => {
    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody={false}
          callNotes={null}
          hasHumanNotes={false}
          hasOutcomeSaved={false}
          hasOutcomeNotes={false}
          callReadiness={readyReadiness}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Generate follow-up"),
    );
    expect(button?.textContent).toMatch(/Generate follow-up/i);
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain("needs at least a script");
  });

  it("shows readiness message when the call is not terminal", () => {
    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={notTerminalReadiness}
        />,
      );
    });

    const button = container.querySelector("button");
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain("Call is still in progress");
  });

  it("disables the CTA when the terminal call still lacks an outcome", () => {
    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved={false}
          hasOutcomeNotes={false}
          callReadiness={missingOutcomeReadiness}
          automatedDialSnapshot={terminalMissingOutcomeSnapshot}
        />,
      );
    });

    const button = container.querySelector("button");
    expect(button?.textContent).toMatch(/Generate follow-up/i);
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain(
      "Record how the call went before generating a follow-up",
    );
  });

  it("enables the CTA once the call readiness is satisfied again", () => {
    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved={false}
          hasOutcomeNotes={false}
          callReadiness={missingOutcomeReadiness}
          automatedDialSnapshot={terminalMissingOutcomeSnapshot}
        />,
      );
    });

    const disabledButton = container.querySelector("button");
    expect(disabledButton?.hasAttribute("disabled")).toBe(true);

    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={readyReadiness}
          automatedDialSnapshot={terminalReadySnapshot}
        />,
      );
    });

    const enabledButton = container.querySelector("button");
    expect(enabledButton?.hasAttribute("disabled")).toBe(false);
    expect(enabledButton?.textContent).toContain("Generate follow-up");
  });

  it("shows a post-save nudge message when the outcome-saved event fires", async () => {
    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={readyReadiness}
          automatedDialSnapshot={terminalReadySnapshot}
        />,
      );
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("calls-after-call-outcome-saved", { detail: {} }));
    });

    await flushReactUpdates();
    expect(container.textContent).toContain("Outcome saved. You can now generate a follow-up.");
  });

  it("shows summary and draft once AskBob returns a result", async () => {
    mockRunAction.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      callId: "call-1",
      result: {
        afterCallSummary: "Wrapped summary",
        recommendedActionLabel: "Next move",
        recommendedActionSteps: ["Step one"],
        suggestedChannel: "sms",
        draftMessageBody: "Hey there",
        urgencyLevel: "normal",
        notesForTech: null,
        modelLatencyMs: 5,
      },
    });
    mockCacheResult.mockReturnValue("after-cache");
    mockCacheDraft.mockReturnValue("draft-key");

    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={readyReadiness}
      />,
    );
  });

  const generateButton = container.querySelector("button");
    if (generateButton) {
      act(() => {
        generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    await flushReactUpdates();

    expect(container.textContent).toContain("Wrapped summary");
    expect(mockCacheResult).toHaveBeenCalledWith("job-1", "call-1", expect.any(Object));
    const openButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open composer"),
    );
    expect(openButton).toBeTruthy();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    if (openButton) {
      act(() => {
        openButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(mockCacheDraft).toHaveBeenCalledWith({
      body: "Hey there",
      jobId: "job-1",
      customerId: "customer-1",
    });
    expect(container.textContent).toContain("Back to job");
    expect(mockRunAction).toHaveBeenCalledWith(
      expect.objectContaining({ generationSource: "call_session" }),
    );
    const regenerateButton = container.querySelector("button");
    expect(regenerateButton?.textContent).toMatch(/Regenerate follow-up/i);
    const openComposerLogEntry = logSpy.mock.calls.find(
      (entry) => entry[0] === "[calls-after-call-open-composer-click]",
    );
    expect(openComposerLogEntry).toBeTruthy();
    expect(openComposerLogEntry?.[1]).toEqual({
      callId: "call-1",
      jobId: "job-1",
      customerId: "customer-1",
      draftKey: "draft-key",
    });
    logSpy.mockRestore();
  });

  it("keeps the CTA as Generate when readiness goes away after a cached draft exists", async () => {
    mockRunAction.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      callId: "call-1",
      result: {
        afterCallSummary: "Cached summary",
        recommendedActionLabel: "Next move",
        recommendedActionSteps: ["Step one"],
        suggestedChannel: "sms",
        draftMessageBody: "Hey there",
        urgencyLevel: "normal",
        notesForTech: null,
        modelLatencyMs: 5,
      },
    });
    mockCacheResult.mockReturnValue("after-cache");
    mockCacheDraft.mockReturnValue("draft-key");

    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={readyReadiness}
        />,
      );
    });

    const generateButton = container.querySelector("button");
    if (generateButton) {
      act(() => {
        generateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    await flushReactUpdates();
    const firstButton = container.querySelector("button");
    expect(firstButton?.textContent).toMatch(/Regenerate follow-up/i);

    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={notTerminalReadiness}
        />,
      );
    });

    await flushReactUpdates();
    const disabledButton = container.querySelector("button");
    expect(disabledButton?.hasAttribute("disabled")).toBe(true);
    expect(disabledButton?.textContent).toMatch(/Generate follow-up/i);
    expect(container.textContent).toContain("Call is still in progress");
  });

  it("shows the server not-ready message and keeps the button disabled when the backend blocks", async () => {
    mockRunAction.mockResolvedValue({
      ok: false,
      code: "not_ready_for_after_call",
      message: "Hold until the call completes",
    });
    act(() => {
      root?.render(
        <AskBobAfterCallCard
          callId="call-1"
          jobId="job-1"
          workspaceId="workspace-1"
          customerId="customer-1"
          hasAskBobScriptBody
          callNotes="Script body"
          hasHumanNotes
          hasOutcomeSaved
          hasOutcomeNotes
          callReadiness={readyReadiness}
        />,
      );
    });

    const button = container.querySelector("button");
    if (button) {
      act(() => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    await flushReactUpdates();

    expect(container.textContent).toContain("Hold until the call completes");
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(mockRunAction).toHaveBeenCalledTimes(1);
  });
});
