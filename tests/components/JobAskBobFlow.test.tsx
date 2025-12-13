import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

let capturedPanelProps: Record<string, unknown> | null = null;
let capturedFollowupProps: Record<string, unknown> | null = null;

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedPanelProps = props;
    return <div data-testid="mock-call-assist" />;
  },
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedFollowupProps = props;
    return <div data-testid="mock-followup" />;
  },
}));

describe("JobAskBobFlow wiring", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    capturedPanelProps = null;
    capturedFollowupProps = null;
    pushMock.mockClear();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
  });

  it("passes job/customer context and call handler into AskBobCallAssistPanel", async () => {
    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");
    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15551234567"
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

    expect(capturedPanelProps).toMatchObject({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      customerDisplayName: "Customer",
      customerPhoneNumber: "+15551234567",
      followupCallRecommended: true,
      followupCallPurpose: "Explain quote",
      followupCallTone: "friendly and confident",
      followupCallIntents: null,
      followupCallIntentsToken: 0,
      latestCallOutcomeLabel: null,
    });
    expect(typeof capturedPanelProps?.onStartCallWithScript).toBe("function");
  });

  it("provides the latest call outcome label when an outcome is available", async () => {
    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");
    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15551234567"
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
          latestCallOutcome={{
            callId: "call-1",
            occurredAt: "2025-01-01T10:00:00Z",
            reachedCustomer: true,
            outcomeCode: "reached_needs_followup",
            outcomeNotes: null,
            isAskBobAssisted: false,
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(capturedPanelProps?.latestCallOutcomeLabel).toContain("Needs follow-up");
    expect(capturedFollowupProps?.latestCallOutcome).toMatchObject({
      callId: "call-1",
      outcomeCode: "reached_needs_followup",
    });
    expect(capturedFollowupProps?.stepCompleted).toBe(false);
  });
});
