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
  default: () => <div data-testid="askbob-step-2">Step 2</div>,
}));

vi.mock("@/components/askbob/AskBobMaterialsPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-3">Step 3</div>,
}));

vi.mock("@/components/askbob/AskBobQuotePanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-4">Step 4</div>,
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-5">Step 5</div>,
}));

vi.mock("@/components/askbob/AskBobSchedulerPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-6">Step 6</div>,
}));

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-7">Step 7</div>,
}));

vi.mock("@/components/askbob/JobAskBobAfterCallPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-8">Step 8</div>,
}));

vi.mock("@/components/askbob/AskBobAutomatedCallPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="askbob-step-9">Step 9</div>,
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

  it("renders job pipeline before calling pipeline with steps ordered inside each group", async () => {
    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          jobTitle="Job"
          jobDescription="Description"
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
      jobPipeline?.querySelectorAll('[data-testid^="askbob-step-"]') ?? [],
    ).map((node) => node.getAttribute("data-testid"));
    expect(jobSteps).toEqual([
      "askbob-step-1",
      "askbob-step-2",
      "askbob-step-3",
      "askbob-step-4",
    ]);

    const callingSteps = Array.from(
      callingPipeline?.querySelectorAll('[data-testid^="askbob-step-"]') ?? [],
    ).map((node) => node.getAttribute("data-testid"));
    expect(callingSteps).toEqual([
      "askbob-step-5",
      "askbob-step-6",
      "askbob-step-7",
      "askbob-step-8",
      "askbob-step-9",
    ]);
  });
});
