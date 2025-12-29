import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROGRESS_STEPS } from "@/app/(app)/jobs/[id]/progressSteps";

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

  it("renders the progress rows in order with the scheduler rendered after the accordion", async () => {
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

    const accordion = container.querySelector('[data-testid="progress-accordion"]');
    expect(accordion).toBeTruthy();

    const rows = Array.from(
      accordion?.querySelectorAll<HTMLElement>('section[data-testid^="progress-row-"]') ?? [],
    );
    expect(rows).toHaveLength(PROGRESS_STEPS.length);
    const rowIds = rows.map((section) => section.getAttribute("data-testid"));
    expect(rowIds).toStrictEqual(PROGRESS_STEPS.map((step) => `progress-row-${step.key}`));

    const order = Array.from(
      container.querySelectorAll('[data-testid="progress-accordion"], [data-testid="askbob-scheduler-section"]'),
    ).map((node) => node.getAttribute("data-testid"));
    expect(order).toEqual(["progress-accordion", "askbob-scheduler-section"]);
  });
});
