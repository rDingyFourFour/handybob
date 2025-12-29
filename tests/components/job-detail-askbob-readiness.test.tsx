import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const renderReadiness = (readiness?: { isReady?: boolean; blockingReason?: string | null }) =>
  readiness?.isReady ? "Ready" : `Not ready: ${readiness?.blockingReason ?? "not ready"}`;

vi.mock("@/components/askbob/JobAskBobPanel", () => ({
  __esModule: true,
  default: (props: { stepReadiness?: { isReady?: boolean; blockingReason?: string | null } }) => (
    <div data-testid="readiness-diagnose">{renderReadiness(props.stepReadiness)}</div>
  ),
}));

vi.mock("@/components/askbob/AskBobMaterialsPanel", () => ({
  __esModule: true,
  default: (props: { stepReadiness?: { isReady?: boolean; blockingReason?: string | null } }) => (
    <div data-testid="readiness-materials">{renderReadiness(props.stepReadiness)}</div>
  ),
}));

vi.mock("@/components/askbob/AskBobQuotePanel", () => ({
  __esModule: true,
  default: () => <div data-testid="readiness-quote" />,
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="readiness-followup" />,
}));

vi.mock("@/components/askbob/AskBobSchedulerPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="readiness-scheduler" />,
}));

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: (props: { stepReadiness?: { isReady?: boolean; blockingReason?: string | null } }) => (
    <div data-testid="readiness-call-assist">{renderReadiness(props.stepReadiness)}</div>
  ),
}));

describe("job detail AskBob readiness gating", () => {
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

  it("blocks step readiness when prerequisites are missing", async () => {
    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          initialFollowupSnapshot={{
            recommendedAction: "Call to confirm details",
            rationale: "Needs clarification",
            steps: [],
            shouldSendMessage: false,
            shouldScheduleVisit: false,
            shouldCall: true,
            shouldWait: false,
            modelLatencyMs: 0,
            callRecommended: true,
            callPurpose: "Confirm details",
            callTone: "friendly",
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Not ready: Add a job title or description first.");
    expect(container.querySelector('[data-testid="readiness-materials"]')?.textContent).toContain(
      "Not ready: Run Diagnose first.",
    );
    expect(container.querySelector('[data-testid="readiness-call-assist"]')?.textContent).toContain(
      "Not ready: Add a customer phone number first.",
    );
  });

  it("shows the call session CTA when follow-up recommends calling", async () => {
    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          jobTitle="Job"
          jobDescription="Description"
          customerPhoneNumber="+15551234567"
          initialFollowupSnapshot={{
            recommendedAction: "Call to confirm details",
            rationale: "Needs clarification",
            steps: [],
            shouldSendMessage: false,
            shouldScheduleVisit: false,
            shouldCall: true,
            shouldWait: false,
            modelLatencyMs: 0,
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(callSessionCopy.jobDetail.openCallSessionCta);
  });
});
