import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/askbob/JobAskBobContainer", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-container" />,
}));

vi.mock("@/components/askbob/JobAskBobPanel", () => ({
  __esModule: true,
  default: () => <div>Diagnose panel</div>,
}));

vi.mock("@/components/askbob/AskBobMaterialsPanel", () => ({
  __esModule: true,
  default: () => <div>Materials panel</div>,
}));

vi.mock("@/components/askbob/AskBobQuotePanel", () => ({
  __esModule: true,
  default: () => <div>Quote panel</div>,
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: () => <div>Follow-up panel</div>,
}));

vi.mock("@/components/askbob/AskBobSchedulerPanel", () => ({
  __esModule: true,
  default: () => <div>Scheduler panel</div>,
}));

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: () => <div>Call prep panel</div>,
}));

describe("job detail AskBob step order", () => {
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

  it("renders job pipeline before calling pipeline with panels ordered inside each group", async () => {
    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          jobTitle="Job"
          jobDescription="Description"
          initialFollowupSnapshot={{
            recommendedAction: "Schedule a visit",
            rationale: "Appointment needed",
            steps: [],
            shouldSendMessage: false,
            shouldScheduleVisit: true,
            shouldCall: false,
            shouldWait: false,
            modelLatencyMs: 0,
          }}
        />,
      );
      await Promise.resolve();
    });

    const jobPipeline = container.querySelector('[data-testid="askbob-job-pipeline"]');
    const callingPipeline = container.querySelector('[data-testid="askbob-calling-pipeline"]');

    expect(jobPipeline).toBeTruthy();
    expect(callingPipeline).toBeTruthy();
    const groupOrder = Array.from(
      container.querySelectorAll('[data-testid="askbob-job-pipeline"], [data-testid="askbob-calling-pipeline"]'),
    ).map((node) => node.getAttribute("data-testid"));
    expect(groupOrder).toEqual(["askbob-job-pipeline", "askbob-calling-pipeline"]);

    const jobSteps = Array.from(
      jobPipeline?.querySelectorAll('[data-testid$="-section"]') ?? [],
    ).map((node) => node.getAttribute("data-testid"));
    expect(jobSteps).toEqual([
      "askbob-diagnose-section",
      "askbob-materials-section",
      "askbob-quote-section",
    ]);

    const callingSteps = Array.from(
      callingPipeline?.querySelectorAll('[data-testid$="-section"]') ?? [],
    ).map((node) => node.getAttribute("data-testid"));
    expect(callingSteps).toEqual([
      "askbob-followup-section",
      "askbob-scheduler-section",
    ]);
  });
});
