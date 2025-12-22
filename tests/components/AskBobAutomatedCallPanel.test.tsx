import { act, type ChangeEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import AskBobAutomatedCallPanel from "@/components/askbob/AskBobAutomatedCallPanel";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";
import { getCallSessionDialStatus } from "@/app/(app)/calls/actions/getCallSessionDialStatus";
import { saveAutomatedCallNotesAction } from "@/app/(app)/calls/actions/saveAutomatedCallNotesAction";
import { ASKBOB_AUTOMATED_VOICE_DEFAULT } from "@/lib/domain/askbob/speechPlan";

vi.mock("@/app/(app)/calls/actions/startAskBobAutomatedCall", () => ({
  startAskBobAutomatedCall: vi.fn(),
}));

vi.mock("@/app/(app)/calls/actions/getCallSessionDialStatus", () => ({
  getCallSessionDialStatus: vi.fn(),
}));

vi.mock("@/app/(app)/calls/actions/saveAutomatedCallNotesAction", () => ({
  saveAutomatedCallNotesAction: vi.fn(),
}));

const mockStartCallAction = startAskBobAutomatedCall as unknown as ReturnType<typeof vi.fn>;
const mockGetSessionStatus = getCallSessionDialStatus as unknown as ReturnType<typeof vi.fn>;
const mockSaveAutomatedCallNotesAction = saveAutomatedCallNotesAction as unknown as ReturnType<typeof vi.fn>;

const ORIGINAL_FETCH = global.fetch;

function findPrimaryButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes("Place automated call"),
  );
}

describe("AskBobAutomatedCallPanel", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockStartCallAction.mockReset();
    mockGetSessionStatus.mockReset();
    mockSaveAutomatedCallNotesAction.mockReset();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
    global.fetch = ORIGINAL_FETCH;
    vi.useRealTimers();
  });

  it("disables the primary CTA without a customer phone", async () => {
    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber={null}
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    expect(button).toBeDefined();
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("disables the primary CTA without a script", async () => {
    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody={null}
          callScriptSummary={null}
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("shows confirmation and view link after a successful automated call", async () => {
    const successPayload = {
      status: "success" as const,
      code: "call_started" as const,
      message: "Automated call started",
      callId: "call-123",
      label: "Automated call started",
      twilioStatus: "ringing",
      twilioCallSid: "twilio-abc",
    };
    mockStartCallAction.mockResolvedValue(successPayload);
    const onSuccess = vi.fn();

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          onAutomatedCallSuccess={onSuccess}
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCallAction).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("Automated call started");
    expect(container.textContent).toContain("Call started");
    expect(container.textContent).toContain("Twilio status");
    expect(container.querySelector("a[href=\"/calls/call-123\"]")?.textContent).toContain("Open call session");
  });

  it("displays an error when the automated call fails", async () => {
    mockStartCallAction.mockResolvedValue({
      status: "failure" as const,
      code: "twilio_not_configured",
      message: "Twilio isn’t configured yet",
      callId: "call-123",
    });
    const onSuccess = vi.fn();

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          onAutomatedCallSuccess={onSuccess}
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCallAction).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Call failed");
    expect(container.textContent).toContain("Twilio isn’t configured yet");
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) =>
        button.textContent?.includes("Try again"),
      ),
    ).toBe(true);
    expect(container.querySelector("a[href=\"/calls/call-123\"]")).toBeTruthy();
  });

  it("prefers diagnostics messaging over generic fallback", async () => {
    mockStartCallAction.mockResolvedValue({
      status: "failure" as const,
      code: "twilio_call_failed",
      message: "",
      callId: "call-123",
      diagnostics: {
        message: "Twilio rejected the dial request.",
      },
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Twilio rejected the dial request.");
    expect(container.textContent).not.toContain("[object Object]");
  });

  it("shows the already started confirmation for idempotent responses", async () => {
    const idempotentPayload = {
      status: "success" as const,
      code: "call_already_started" as const,
      message: "Automated call started",
      label: "Automated call started",
      callId: "call-123",
      twilioStatus: "ringing",
      twilioCallSid: "twilio-abc",
    };
    mockStartCallAction.mockResolvedValue(idempotentPayload);
    const onSuccess = vi.fn();

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          onAutomatedCallSuccess={onSuccess}
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSuccess).toHaveBeenCalledWith("Automated call started");
    expect(container.textContent).toContain("Call already started");
    expect(container.querySelector("a[href=\"/calls/call-123\"]")?.textContent).toContain("Open call session");
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) =>
        button.textContent?.includes("Try again"),
      ),
    ).toBe(false);
  });

  it("keeps the already-started banner when local resets run", async () => {
    const alreadyInProgressPayload = {
      status: "already_in_progress" as const,
      code: "already_in_progress" as const,
      message: "Call is already in progress. Open call session.",
      callId: "call-789",
      twilioStatus: "queued",
      twilioCallSid: "twilio-abc",
    };
    mockStartCallAction.mockResolvedValue(alreadyInProgressPayload);

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          resetToken={0}
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Call already started");
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((node) =>
        node.textContent?.includes("Try again"),
      ),
    ).toBe(false);

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          resetToken={1}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Call already started");
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((node) =>
        node.textContent?.includes("Try again"),
      ),
    ).toBe(false);
  });

  it("applies voice and voicemail choices, logs interactions, and surfaces the guard warning", async () => {
    const successPayload = {
      status: "success" as const,
      code: "call_started" as const,
      message: "Automated call started",
      callId: "call-voice",
      label: "Automated call started",
      twilioStatus: "ringing",
      twilioCallSid: "twilio-abc",
    };
    mockStartCallAction.mockResolvedValue(successPayload);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const voiceSelect = container.querySelector<HTMLSelectElement>("select#voice-control");
    const greetingSelect = container.querySelector<HTMLSelectElement>("select#greeting-style-control");
    const voicemailCheckbox = container.querySelector<HTMLInputElement>("input[type='checkbox']");
    expect(voiceSelect).toBeTruthy();
    expect(greetingSelect).toBeTruthy();
    expect(voicemailCheckbox).toBeTruthy();

    await act(async () => {
      if (voiceSelect) {
        voiceSelect.value = "samantha";
        voiceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (greetingSelect) {
        greetingSelect.value = "Friendly";
        greetingSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (voicemailCheckbox) {
        voicemailCheckbox.click();
      }
      await Promise.resolve();
    });
    await act(async () => {});

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCallAction).toHaveBeenCalledTimes(1);
    const payload = mockStartCallAction.mock.calls[0][0];
    expect(payload.voice).not.toBe(ASKBOB_AUTOMATED_VOICE_DEFAULT);
    expect(logSpy.mock.calls.some((args) => args[0] === "[askbob-automated-call-voice-change]")).toBe(
      true,
    );
    expect(
      logSpy.mock.calls.some((args) => args[0] === "[askbob-automated-call-robocall-guard-visible]"),
    ).toBe(true);
    expect(container.textContent).toContain("Automated calls are for job-related follow-ups only.");

    logSpy.mockRestore();
  });

  it("polls Twilio status until recording is ready when expanded", async () => {
    vi.useFakeTimers();
    const responses = [
      {
        callId: "call-123",
        twilioCallSid: "sid-1",
        twilioStatus: "queued",
        twilioStatusUpdatedAt: "2024-01-01T00:00:00Z",
        isTerminal: false,
        hasRecording: false,
        recordingDurationSeconds: null,
      },
      {
        callId: "call-123",
        twilioCallSid: "sid-1",
        twilioStatus: "ringing",
        twilioStatusUpdatedAt: "2024-01-01T00:00:05Z",
        isTerminal: false,
        hasRecording: false,
        recordingDurationSeconds: null,
      },
      {
        callId: "call-123",
        twilioCallSid: "sid-1",
        twilioStatus: "completed",
        twilioStatusUpdatedAt: "2024-01-01T00:00:10Z",
        isTerminal: true,
        hasRecording: false,
        recordingDurationSeconds: null,
      },
      {
        callId: "call-123",
        twilioCallSid: "sid-1",
        twilioStatus: "completed",
        twilioStatusUpdatedAt: "2024-01-01T00:00:15Z",
        isTerminal: true,
        hasRecording: true,
        recordingDurationSeconds: 52,
      },
    ];
    const queue = [...responses];
    mockGetSessionStatus.mockImplementation(() => {
      const next = queue.shift() ?? responses[responses.length - 1];
      return Promise.resolve(next);
    });
    mockStartCallAction.mockResolvedValue({
      status: "success" as const,
      code: "call_started" as const,
      message: "Automated call started",
      label: "Automated call started",
      callId: "call-123",
      twilioStatus: "queued",
      twilioCallSid: "twilio-abc",
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetSessionStatus).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Twilio status: Queued");
    expect(container.textContent).toContain("Recording: processing");

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(mockGetSessionStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Twilio status: Ringing");

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(mockGetSessionStatus).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Recording: processing");

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(mockGetSessionStatus).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("Recording: ready · 52s");

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(mockGetSessionStatus).toHaveBeenCalledTimes(4);
  });

  it("skips polling when the panel is collapsed", async () => {
    mockGetSessionStatus.mockResolvedValue({
      callId: "call-456",
      twilioCallSid: "sid-456",
      twilioStatus: "queued",
      twilioStatusUpdatedAt: "2024-01-01T00:00:00Z",
      isTerminal: false,
      hasRecording: false,
      recordingDurationSeconds: null,
    });
    vi.useFakeTimers();

    mockStartCallAction.mockResolvedValue({
      status: "success" as const,
      code: "call_started" as const,
      message: "Automated call started",
      label: "Automated call started",
      callId: "call-456",
      twilioStatus: "queued",
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          stepCollapsed
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(mockGetSessionStatus).not.toHaveBeenCalled();
  });

  it("shows an inline hint when the call is already in progress", async () => {
    mockStartCallAction.mockResolvedValue({
      status: "already_in_progress" as const,
      code: "already_in_progress" as const,
      message: "Call is already in progress. Open call session.",
      callId: "call-456",
      twilioStatus: "queued",
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Call already started");
    expect(container.textContent).toContain("Call is already in progress. Open call session.");
    expect(container.querySelector("a[href=\"/calls/call-456\"]")).toBeTruthy();
    expect(container.textContent).not.toContain("Call failed");
  });

  it("allows retrying after failure without clearing script context", async () => {
    mockStartCallAction
      .mockResolvedValueOnce({
        status: "failure" as const,
        code: "twilio_not_configured" as const,
        message: "Twilio isn’t configured yet",
        callId: "call-789",
      })
      .mockResolvedValueOnce({
        status: "success" as const,
        code: "call_started" as const,
        message: "Automated call started",
        label: "Automated call started",
        callId: "call-789",
        twilioStatus: "ringing",
        twilioCallSid: "twilio-abc",
      });
    const onSuccess = vi.fn();

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          onAutomatedCallSuccess={onSuccess}
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Hello preview");
    const tryAgainButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (node) => node.textContent?.includes("Try again"),
    );
    expect(tryAgainButton).toBeTruthy();
    await act(async () => {
      tryAgainButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCallAction).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Call started");
    expect(container.textContent).toContain("Hello preview");
    expect(onSuccess).toHaveBeenCalledWith("Automated call started");
  });

  it("shows the live notes editor once an automated call starts", async () => {
    mockStartCallAction.mockResolvedValue({
      status: "success",
      code: "call_started",
      message: "Call started",
      label: "Call started",
      callId: "call-123",
      twilioStatus: null,
      twilioCallSid: null,
    });
    mockGetSessionStatus.mockResolvedValue({
      callId: "call-123",
      twilioCallSid: null,
      twilioStatus: "in-progress",
      twilioStatusUpdatedAt: null,
      isTerminal: false,
      hasRecording: false,
      recordingDurationSeconds: null,
      automatedCallNotes: "Initial note",
    });
    mockSaveAutomatedCallNotesAction.mockResolvedValue({
      ok: true,
      callId: "call-123",
      notes: "Initial note",
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea#automated-call-live-notes");
    expect(textarea).toBeTruthy();
  });

  it("autosaves live notes with throttled saves and status text", async () => {
    vi.useFakeTimers();
    mockStartCallAction.mockResolvedValue({
      status: "success",
      code: "call_started",
      message: "Call started",
      label: "Call started",
      callId: "call-123",
      twilioStatus: null,
      twilioCallSid: null,
    });
    mockGetSessionStatus.mockResolvedValue({
      callId: "call-123",
      twilioCallSid: null,
      twilioStatus: "in-progress",
      twilioStatusUpdatedAt: null,
      isTerminal: false,
      hasRecording: false,
      recordingDurationSeconds: null,
      automatedCallNotes: null,
    });
    mockSaveAutomatedCallNotesAction.mockResolvedValue({
      ok: true,
      callId: "call-123",
      notes: "First note",
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea#automated-call-live-notes");
    if (!textarea) {
      throw new Error("Live notes textarea not found");
    }

    const dispatchNotesChange = (value: string) => {
      textarea.value = value;
      const reactPropsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps"));
      const reactProps = reactPropsKey
        ? (textarea as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>
        : undefined;
      const handler = reactProps?.onChange as
        | ((event: ChangeEvent<HTMLTextAreaElement>) => void)
        | undefined;
      if (!handler) {
        throw new Error("React change handler is not available");
      }
      handler({ target: textarea, currentTarget: textarea } as ChangeEvent<HTMLTextAreaElement>);
    };

    await act(async () => {
      dispatchNotesChange("First note");
    });
    expect(mockSaveAutomatedCallNotesAction).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledTimes(1);
    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      callId: "call-123",
      notes: "First note",
    });
    expect(container.textContent).toContain("Saved");

    await act(async () => {
      dispatchNotesChange("Second note");
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledTimes(2);
    expect(mockSaveAutomatedCallNotesAction).toHaveBeenLastCalledWith({
      workspaceId: "workspace-1",
      callId: "call-123",
      notes: "Second note",
    });
    expect(container.textContent).toContain("Saved");
    vi.useRealTimers();
  });

  it("finalizes dirty notes once the automated dial is terminal", async () => {
    vi.useFakeTimers();
    const inProgressSnapshot = {
      callId: "call-123",
      workspaceId: "workspace-1",
      twilioCallSid: null,
      twilioStatus: "ringing",
      twilioStatusUpdatedAt: "2024-01-01T00:00:00Z",
      isTerminal: false,
      isInProgress: true,
      hasRecordingMetadata: true,
      hasRecordingReady: false,
      hasTranscriptOrNotes: false,
    };
    const terminalSnapshot = {
      ...inProgressSnapshot,
      twilioStatus: "completed",
      isTerminal: true,
      isInProgress: false,
      hasRecordingReady: true,
    };
    mockStartCallAction.mockResolvedValue({
      status: "success",
      code: "call_started",
      message: "Call started",
      label: "Call started",
      callId: "call-123",
      twilioStatus: null,
      twilioCallSid: null,
    });
    mockGetSessionStatus.mockResolvedValue({
      callId: "call-123",
      twilioCallSid: null,
      twilioStatus: "completed",
      twilioStatusUpdatedAt: null,
      isTerminal: true,
      hasRecording: true,
      recordingDurationSeconds: 45,
      automatedCallNotes: null,
    });
    mockSaveAutomatedCallNotesAction.mockResolvedValue({
      ok: true,
      callId: "call-123",
      notes: "Final note",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await act(async () => {
    root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          automatedDialSnapshot={inProgressSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const button = findPrimaryButton(container);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea#automated-call-live-notes");
    if (!textarea) {
      throw new Error("Live notes textarea not found");
    }

    const dispatchNotesChange = (value: string) => {
      textarea.value = value;
      const reactPropsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps"));
      const reactProps = reactPropsKey
        ? (textarea as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>
        : undefined;
      const handler = reactProps?.onChange as
        | ((event: ChangeEvent<HTMLTextAreaElement>) => void)
        | undefined;
      if (!handler) {
        throw new Error("React change handler is not available");
      }
      handler({ target: textarea, currentTarget: textarea } as ChangeEvent<HTMLTextAreaElement>);
    };

    await act(async () => {
      dispatchNotesChange("Final note");
      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(
        <AskBobAutomatedCallPanel
          workspaceId="workspace-1"
          jobId="job-1"
          customerPhoneNumber="+15550001234"
          customerDisplayName="Customer"
          callScriptBody="Hello preview"
          callScriptSummary="Summary"
          jobTitle="Title"
          jobDescription="Description"
          automatedDialSnapshot={terminalSnapshot}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls.some((args) => args[0] === "[askbob-automated-call-notes-finalize-attempt]")).toBe(
      true,
    );
    expect(logSpy.mock.calls.some((args) => args[0] === "[askbob-automated-call-notes-finalize-success]")).toBe(true);
    expect(container.textContent).toContain("Call ended and notes saved. Ready to generate a follow-up.");
    logSpy.mockRestore();
  });
});
