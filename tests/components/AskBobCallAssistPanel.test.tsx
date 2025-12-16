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

function findCallGoalButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.trim() === label,
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
    expect(mockRunAction).toHaveBeenCalledTimes(1);
    expect(mockRunAction).toHaveBeenCalledTimes(1);
    const actionPayload = mockRunAction.mock.calls[0][0];
    expect(actionPayload.callPersonaStyle).toBeUndefined();
    expect(actionPayload.callIntents).toEqual(["quote_followup"]);

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

  it("lets technicians select multiple call goals and resets them", async () => {
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
          onCallScriptPersonaChange={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    const quoteButton = findCallGoalButton(container, "Follow up on a quote");
    const scheduleButton = findCallGoalButton(container, "Schedule or confirm a visit");
    expect(quoteButton).toBeTruthy();
    expect(scheduleButton).toBeTruthy();
    expect(quoteButton?.getAttribute("aria-pressed")).toBe("true");
    expect(scheduleButton?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      scheduleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(scheduleButton?.getAttribute("aria-pressed")).toBe("true");

    const generateButton = findButton(container, "Generate call script");
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const actionPayload = mockRunAction.mock.calls[0][0];
    expect(actionPayload.callIntents).toEqual(["quote_followup", "schedule_visit"]);

    const resetButton = findButton(container, "Reset this step");
    await act(async () => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(scheduleButton?.getAttribute("aria-pressed")).toBe("false");
    expect(quoteButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("requires at least one call goal before generating a script", async () => {
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
        />,
      );
      await Promise.resolve();
    });

    const quoteButton = findCallGoalButton(container, "Follow up on a quote");
    await act(async () => {
      quoteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const generateButton = findButton(container, "Generate call script");
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockRunAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Choose at least one call goal before generating a script.");
  });

  it("lets technicians pick a persona, includes it in the payload, and resets the selection", async () => {
    const personaChangeSpy = vi.fn();

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
          onCallScriptPersonaChange={personaChangeSpy}
          stepCollapsed={false}
          stepCompleted={false}
        />,
      );
      await Promise.resolve();
    });

    const personaSelect = container.querySelector<HTMLSelectElement>(
      'select[name="callPersonaStyle"]',
    );
    expect(personaSelect).toBeTruthy();

    await act(async () => {
      if (!personaSelect) {
        throw new Error("Persona select missing");
      }
      personaSelect.value = "direct_concise";
      personaSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(personaSelect?.value).toBe("direct_concise");

    const generateButton = findButton(container, "Generate call script");
    expect(generateButton).toBeTruthy();
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const actionPayload = mockRunAction.mock.calls[0][0];
    expect(actionPayload.callPersonaStyle).toBe("direct_concise");
    expect(personaChangeSpy).toHaveBeenCalledWith("direct_concise");

    const resetButton = findButton(container, "Reset this step");
    await act(async () => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(personaChangeSpy).toHaveBeenLastCalledWith(null);
  });

  it("shows the latest call outcome and sends it along with the request", async () => {
    const latestLabel = "Reached · Needs follow-up · 2025-01-01 10:00";

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
          latestCallOutcomeLabel={latestLabel}
          latestCallOutcome={{
            callId: "call-1",
            occurredAt: "2025-01-01T10:00:00Z",
            reachedCustomer: true,
            outcomeCode: "reached_needs_followup",
            outcomeNotes: null,
            isAskBobAssisted: false,
          }}
          onToggleCollapse={vi.fn()}
          onCallScriptSummaryChange={vi.fn()}
          stepCollapsed={false}
          stepCompleted={false}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(`Latest call outcome: ${latestLabel}`);

    const generateButton = findButton(container, "Generate call script");
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const actionPayload = mockRunAction.mock.calls[0][0];
    expect(actionPayload.extraDetails).toBe(`Latest call outcome: ${latestLabel}`);
    expect(actionPayload.latestCallOutcome).toMatchObject({
      callId: "call-1",
      outcomeCode: "reached_needs_followup",
    });
  });
});
