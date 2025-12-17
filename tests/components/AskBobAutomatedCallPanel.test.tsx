import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import AskBobAutomatedCallPanel from "@/components/askbob/AskBobAutomatedCallPanel";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";

vi.mock("@/app/(app)/calls/actions/startAskBobAutomatedCall", () => ({
  startAskBobAutomatedCall: vi.fn(),
}));

const mockStartCallAction = startAskBobAutomatedCall as unknown as ReturnType<typeof vi.fn>;

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
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
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
});
