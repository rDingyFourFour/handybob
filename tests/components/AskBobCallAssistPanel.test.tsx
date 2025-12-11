import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import AskBobCallAssistPanel from "@/components/askbob/AskBobCallAssistPanel";
import { runAskBobCallScriptAction } from "@/app/(app)/askbob/call-script-actions";

vi.mock("@/app/(app)/askbob/call-script-actions", () => ({
  runAskBobCallScriptAction: vi.fn(),
}));

const mockRunAction = runAskBobCallScriptAction as unknown as ReturnType<typeof vi.fn>;

const generateScriptResult = {
  ok: true,
  scriptBody: "Main script body",
  openingLine: "Hello there",
  closingLine: "Best regards",
  keyPoints: ["Point A", "Point B"],
  suggestedDurationMinutes: 5,
};

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

describe("AskBobCallAssistPanel", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    mockRunAction.mockResolvedValue(generateScriptResult);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the Start call CTA and triggers callback with the condensed script", async () => {
    const onStartCall = vi.fn();

    await act(async () => {
      root?.render(
        <AskBobCallAssistPanel
          stepNumber={7}
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer Name"
          customerPhoneNumber="+1555000000"
          jobTitle="Fix sink"
          jobDescription="Description"
          diagnosisSummary="Diagnosis"
          materialsSummary="Materials"
          lastQuoteSummary="Quote #1"
          followupSummary="Follow-up"
          onToggleCollapse={vi.fn()}
          onCallScriptSummaryChange={vi.fn()}
          stepCollapsed={false}
          stepCompleted={false}
          onStartCallWithScript={onStartCall}
        />,
      );
      await Promise.resolve();
    });

    const generateButton = findButton(container, "Generate call script");
    expect(generateButton).toBeTruthy();

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const startButton = findButton(container, "Start call with this script");
    expect(startButton).toBeTruthy();

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartCall).toHaveBeenCalledTimes(1);
    const payload = onStartCall.mock.calls[0][0];
    expect(payload.jobId).toBe("job-1");
    expect(payload.customerPhone).toBe("+1555000000");
    expect(payload.scriptBody).toContain("Hello there");
    expect(payload.scriptBody).toContain("Main script body");
  });

  it("prefills call purpose and tone from follow-up hints", async () => {
    await act(async () => {
      root?.render(
        <AskBobCallAssistPanel
          stepNumber={7}
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer Name"
          customerPhoneNumber="+1555000000"
          jobTitle="Fix sink"
          jobDescription="Description"
          diagnosisSummary="Diagnosis"
          materialsSummary="Materials"
          lastQuoteSummary="Quote #1"
          followupSummary="Follow-up"
          followupCallRecommended
          followupCallPurpose="Explain quote and get a decision"
          followupCallTone="friendly and confident"
          onToggleCollapse={vi.fn()}
          onCallScriptSummaryChange={vi.fn()}
          stepCollapsed={false}
          stepCompleted={false}
        />,
      );
      await Promise.resolve();
    });

    const toneInput = container.querySelector<HTMLInputElement>('input[placeholder="friendly and clear"]');
    expect(toneInput?.value).toBe("friendly and confident");
    expect(container.textContent).toContain(
      "AskBob follow-up suggests calling for: Explain quote and get a decision",
    );
    expect(container.textContent).toContain("Suggested tone: friendly and confident");
  });
});
