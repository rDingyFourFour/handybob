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
      callId: "call-123",
      label: "Automated call started",
      twilioStatus: "ringing",
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
    expect(container.textContent).toContain("Automated call started");
    expect(container.textContent).toContain("Twilio status");
    expect(container.querySelector("a[href=\"/calls/call-123\"]")).toBeTruthy();
  });

  it("displays an error when the automated call fails", async () => {
    mockStartCallAction.mockResolvedValue({
      status: "failure" as const,
      reason: "twilio_not_configured",
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
    expect(container.textContent).toContain("Twilio isn’t configured yet");
    expect(container.querySelector("a[href=\"/calls/call-123\"]")).toBeTruthy();
    expect(container.textContent).toContain("View call details");
  });
});
