import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AskBobAutomatedCallPanel from "@/components/askbob/AskBobAutomatedCallPanel";
import AskBobAfterCallCard from "@/app/(app)/calls/[id]/AskBobAfterCallCard";
import CallOutcomeCaptureCard from "@/app/(app)/calls/[id]/CallOutcomeCaptureCard";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";
import { getCallSessionDialStatus } from "@/app/(app)/calls/actions/getCallSessionDialStatus";
import type { CallAutomatedDialSnapshot, CallSessionFollowupReadiness } from "@/lib/domain/calls/sessions";
import {
  buildNonTerminalDialStatus,
  buildRecordingPendingDialStatus,
  buildRecordingReadyDialStatus,
  buildTerminalCompletedDialStatus,
} from "@/tests/helpers/callSessionDialStatusFixtures";

const mockStartCall = startAskBobAutomatedCall as unknown as ReturnType<typeof vi.fn>;
const mockGetStatus = getCallSessionDialStatus as unknown as ReturnType<typeof vi.fn>;
const mockRunAfterCallAction = vi.fn();

vi.mock("@/app/(app)/calls/actions/startAskBobAutomatedCall", () => ({
  startAskBobAutomatedCall: vi.fn(),
}));

vi.mock("@/app/(app)/calls/actions/getCallSessionDialStatus", () => ({
  getCallSessionDialStatus: vi.fn(),
}));

vi.mock("@/app/(app)/askbob/after-call-actions", () => ({
  runAskBobJobAfterCallAction: (...args: unknown[]) => mockRunAfterCallAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseAutomatedSnapshot: CallAutomatedDialSnapshot = {
  callId: "call-123",
  workspaceId: "workspace-1",
  twilioCallSid: "sid-123",
  twilioStatus: "completed",
  twilioStatusUpdatedAt: "2024-01-01T00:00:00Z",
  isTerminal: true,
  isInProgress: false,
  hasRecordingMetadata: true,
  hasRecordingReady: true,
  hasTranscriptOrNotes: false,
  hasOutcome: false,
  hasOutcomeNotes: false,
  reachedCustomer: null,
};

const notReadyReadiness: CallSessionFollowupReadiness = {
  isReady: false,
  reasons: ["missing_outcome"],
};

const readyReadiness: CallSessionFollowupReadiness = {
  isReady: true,
  reasons: [],
};

function TestHarness({
  callReadiness,
  automatedDialSnapshot,
}: {
  callReadiness: CallSessionFollowupReadiness;
  automatedDialSnapshot: CallAutomatedDialSnapshot;
}) {
  return (
    <div>
      <AskBobAutomatedCallPanel
        workspaceId="workspace-1"
        jobId="job-1"
        customerPhoneNumber="+15550001234"
        customerDisplayName="Customer"
        callScriptBody="Hello preview"
        callScriptSummary="Summary"
        jobTitle="Title"
        jobDescription="Description"
      />
      <CallOutcomeCaptureCard
        callId="call-123"
        workspaceId="workspace-1"
        jobId="job-1"
        initialOutcomeCode={null}
        initialReachedCustomer={null}
        initialNotes={null}
        initialRecordedAt={null}
        hasAskBobScriptHint={false}
        automatedDialSnapshot={automatedDialSnapshot}
        isAutomatedCallContext
      />
      <AskBobAfterCallCard
        callId="call-123"
        jobId="job-1"
        workspaceId="workspace-1"
        customerId="customer-1"
        hasAskBobScriptBody
        callNotes="Summary"
        hasHumanNotes
        hasOutcomeSaved={automatedDialSnapshot.hasOutcome}
        hasOutcomeNotes={automatedDialSnapshot.hasOutcomeNotes}
        callReadiness={callReadiness}
        automatedDialSnapshot={automatedDialSnapshot}
        generationSource="call_session"
      />
    </div>
  );
}

describe("AskBob automated call process", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockStartCall.mockReset();
    mockGetStatus.mockReset();
    mockRunAfterCallAction.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
    vi.useRealTimers();
  });

  it("runs the Step 9 lifecycle and surfaces gating cues", async () => {
    mockStartCall.mockResolvedValue({
      status: "success",
      code: "call_started",
      message: "Call started",
      label: "Call started",
      callId: "call-123",
      twilioStatus: "queued",
      twilioCallSid: "sid-123",
    });

    const pollSequence = [
      buildNonTerminalDialStatus({ twilioStatus: "queued" }),
      buildNonTerminalDialStatus({ twilioStatus: "initiated" }),
      buildNonTerminalDialStatus({ twilioStatus: "ringing" }),
      buildNonTerminalDialStatus({ twilioStatus: "answered" }),
      buildTerminalCompletedDialStatus({ hasRecording: false, recordingDurationSeconds: null }),
      buildRecordingPendingDialStatus(),
      buildRecordingReadyDialStatus({ recordingDurationSeconds: 42 }),
    ];
    mockGetStatus.mockImplementation(() => {
      const next = pollSequence.shift();
      return Promise.resolve(next ?? buildRecordingReadyDialStatus({ recordingDurationSeconds: 42 }));
    });

    await act(async () => {
      root?.render(
        <TestHarness callReadiness={notReadyReadiness} automatedDialSnapshot={baseAutomatedSnapshot} />,
      );
      await Promise.resolve();
    });

    const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((node) =>
      node.textContent?.includes("Place automated call"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCall).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        jobId: "job-1",
        customerPhone: "+15550001234",
        scriptBody: "Hello preview",
        scriptSummary: "Summary",
        allowVoicemail: false,
      }),
    );
    expect(container.textContent).toContain("Call started");

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Recording: processing");

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(mockGetStatus).toHaveBeenCalledTimes(4);
    expect(container.textContent).toMatch(/Twilio status: (Ringing|Connected)/);

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(mockGetStatus).toHaveBeenCalledTimes(7);
    expect(container.textContent).toContain("Recording: ready");
    expect(container.textContent).toContain("Call started");

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(mockGetStatus).toHaveBeenCalledTimes(7);

    expect(container.textContent).toContain("Call ended. Please record the outcome.");

    act(() => {
      window.dispatchEvent(new CustomEvent("calls-after-call-outcome-saved", { detail: {} }));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Outcome saved. You can now generate a follow-up.");

    const generateButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((node) =>
      node.textContent?.includes("Generate follow-up"),
    );
    expect(generateButton?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      root?.render(
        <TestHarness
          callReadiness={readyReadiness}
          automatedDialSnapshot={{
            ...baseAutomatedSnapshot,
            hasOutcome: true,
            hasOutcomeNotes: true,
            reachedCustomer: true,
          }}
        />,
      );
      await Promise.resolve();
    });

    const enabledButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((node) =>
      node.textContent?.includes("Generate follow-up"),
    );
    expect(enabledButton?.hasAttribute("disabled")).toBe(false);
  });

  it("stops polling after max attempts without terminal status", async () => {
    mockStartCall.mockResolvedValue({
      status: "success",
      code: "call_started",
      message: "Call started",
      label: "Call started",
      callId: "call-123",
      twilioStatus: "queued",
      twilioCallSid: "sid-123",
    });

    mockGetStatus.mockResolvedValue(
      buildNonTerminalDialStatus({
        twilioStatus: "ringing",
        isTerminal: false,
        hasRecording: false,
      }),
    );

    await act(async () => {
      root?.render(
        <TestHarness callReadiness={notReadyReadiness} automatedDialSnapshot={baseAutomatedSnapshot} />,
      );
      await Promise.resolve();
    });

    const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((node) =>
      node.textContent?.includes("Place automated call"),
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(2500);
        await Promise.resolve();
      });
    }
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetStatus).toHaveBeenCalledTimes(30);
    expect(container.textContent).toContain("If polling stops updating");
  });
});
