import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";

vi.mock("@/app/(app)/calls/actions/startAskBobAutomatedCall", () => ({
  startAskBobAutomatedCall: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const MOCK_AUTOMATED_SCRIPT_BODY = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} Mock script body`;
const MOCK_AUTOMATED_SCRIPT_SUMMARY = "Mock summary";

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => {
  type MockAskBobCallAssistPanelProps = {
    onCallScriptBodyChange?: (value: string) => void;
    onCallScriptSummaryChange?: (value: string | null) => void;
  };

  function MockAskBobCallAssistPanel({
    onCallScriptBodyChange,
    onCallScriptSummaryChange,
  }: MockAskBobCallAssistPanelProps) {
    const hasSeededScriptRef = React.useRef(false);

    React.useEffect(() => {
      if (hasSeededScriptRef.current) {
        return;
      }
      hasSeededScriptRef.current = true;

      onCallScriptBodyChange?.(MOCK_AUTOMATED_SCRIPT_BODY);
      onCallScriptSummaryChange?.(MOCK_AUTOMATED_SCRIPT_SUMMARY);
    }, [onCallScriptBodyChange, onCallScriptSummaryChange]);

    return <div data-testid="mock-call-assist" />;
  }

  return {
    __esModule: true,
    default: MockAskBobCallAssistPanel,
  };
});

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-followup" />,
}));

vi.mock("@/components/askbob/JobAskBobAfterCallPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-after-call" />,
}));

vi.mock("@/components/askbob/JobAskBobContainer", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-container" />,
}));

const mockStartCallAction = startAskBobAutomatedCall as unknown as Mock;

function findPlaceCallButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes("Place automated call"),
  );
}

describe("JobAskBobFlow Step 9 smoke", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockStartCallAction.mockReset?.();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
  });

  it("renders Step 9 and surfaces a Twilio not configured failure", async () => {
    mockStartCallAction.mockResolvedValueOnce({
      status: "failure",
      code: "twilio_not_configured",
      message: "Calls aren’t configured yet; please set up telephony to continue.",
      callId: "call-123",
    });

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15550001234"
          jobDescription="desc"
          jobTitle="title"
          askBobLastTaskLabel={null}
          askBobLastUsedAtDisplay={null}
          askBobLastUsedAtIso={null}
          askBobRunsSummary={null}
          initialLastQuoteId={null}
          lastQuoteCreatedAt={null}
          lastQuoteCreatedAtFriendly={null}
          initialDiagnoseSnapshot={null}
          initialMaterialsSnapshot={null}
          initialQuoteSnapshot={null}
          initialFollowupSnapshot={{
            recommendedAction: "Call to check in",
            rationale: "Need an update",
            steps: [],
            shouldSendMessage: false,
            shouldScheduleVisit: false,
            shouldCall: true,
            shouldWait: false,
            modelLatencyMs: 0,
            callRecommended: true,
            callPurpose: "Explain quote",
            callTone: "friendly and confident",
          }}
          lastQuoteSummary={null}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Step 9 · AskBob automated call");
    const button = findPlaceCallButton(container);
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCallAction).toHaveBeenCalledTimes(1);
    const expectedPayload = expect.objectContaining({
      jobId: "job-1",
      workspaceId: "workspace-1",
      customerId: "customer-1",
      scriptBody: expect.stringContaining(ASKBOB_AUTOMATED_SCRIPT_PREFIX),
      scriptSummary: expect.any(String),
    });
    expect(mockStartCallAction).toHaveBeenCalledWith(expectedPayload);
    expect(container.textContent).toContain("Calls aren’t configured yet; please set up telephony to continue.");
    expect(container.querySelector("a[href=\"/calls/call-123\"]")).toBeTruthy();
  });

  it("renders the success UI when the automated call starts", async () => {
    mockStartCallAction.mockResolvedValueOnce({
      status: "success",
      code: "call_started",
      message: "Automated call started",
      label: "Automated call started",
      callId: "call_123",
      twilioStatus: "queued",
      twilioCallSid: "twilio-abc",
    });

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15550001234"
          jobDescription="desc"
          jobTitle="title"
          askBobLastTaskLabel={null}
          askBobLastUsedAtDisplay={null}
          askBobLastUsedAtIso={null}
          askBobRunsSummary={null}
          initialLastQuoteId={null}
          lastQuoteCreatedAt={null}
          lastQuoteCreatedAtFriendly={null}
          initialDiagnoseSnapshot={null}
          initialMaterialsSnapshot={null}
          initialQuoteSnapshot={null}
          initialFollowupSnapshot={{
            recommendedAction: "Call to check in",
            rationale: "Need an update",
            steps: [],
            shouldSendMessage: false,
            shouldScheduleVisit: false,
            shouldCall: true,
            shouldWait: false,
            modelLatencyMs: 0,
            callRecommended: true,
            callPurpose: "Explain quote",
            callTone: "friendly and confident",
          }}
          lastQuoteSummary={null}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Step 9 · AskBob automated call");
    const button = findPlaceCallButton(container);
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockStartCallAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Call started");
    const openCallButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Open call workspace"),
    );
    expect(openCallButton).toBeTruthy();
    expect(openCallButton?.disabled).toBeFalsy();
  });
});
