import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let capturedSchedulerProps: Record<string, unknown> | null = null;
let capturedCallPrepProps: Record<string, unknown> | null = null;
let capturedDiagnoseProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/askbob/JobAskBobPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedDiagnoseProps = props;
    return <div data-testid="mock-diagnose" data-collapsed={String(props.stepCollapsed)} />;
  },
}));

vi.mock("@/components/askbob/AskBobMaterialsPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-materials" />,
}));

vi.mock("@/components/askbob/AskBobQuotePanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-quote" />,
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-followup" />,
}));

vi.mock("@/components/askbob/AskBobSchedulerPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedSchedulerProps = props;
    return <div data-testid="mock-scheduler" data-collapsed={String(props.stepCollapsed)} />;
  },
}));

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedCallPrepProps = props;
    return <div data-testid="mock-call-prep" data-collapsed={String(props.stepCollapsed)} />;
  },
}));

import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";

const baseProps = {
  workspaceId: "workspace-1",
  userId: "user-1",
  jobId: "job-1",
  jobTitle: "Fix sink",
  jobDescription: "Leaking pipe",
  customerPhoneNumber: "+15551234567",
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("job detail AskBob panel visibility", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    capturedSchedulerProps = null;
    capturedCallPrepProps = null;
    capturedDiagnoseProps = null;
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

  it("does not render intake basics or scheduling by default", async () => {
    await act(async () => {
      root?.render(<JobAskBobFlow {...baseProps} />);
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.textContent).not.toContain("Intake basics");
    expect(container.textContent).not.toContain("After-call");
    expect(container.textContent).not.toContain("Manual after-call");
    expect(container.querySelector('[data-testid="mock-scheduler"]')).toBeNull();
  });

  it("renders scheduling when follow-up recommends an appointment", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobFlow
          {...baseProps}
          initialFollowupSnapshot={{
            recommendedAction: "Schedule a visit",
            rationale: "Needs appointment",
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
    await flushEffects();

    expect(container.querySelector('[data-testid="mock-scheduler"]')).toBeTruthy();
    expect(capturedSchedulerProps?.stepCollapsed).toBe(false);
    expect(capturedDiagnoseProps?.stepCollapsed).toBe(true);
  });

  it("renders call prep when follow-up recommends calling", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobFlow
          {...baseProps}
          initialFollowupSnapshot={{
            recommendedAction: "Call the customer",
            rationale: "Needs follow-up",
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
    await flushEffects();

    expect(container.querySelector('[data-testid="mock-call-prep"]')).toBeTruthy();
    expect(capturedCallPrepProps?.stepCollapsed).toBe(false);
  });

  it("shows call prep when the assistant button is used", async () => {
    await act(async () => {
      root?.render(<JobAskBobFlow {...baseProps} />);
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="mock-call-prep"]')).toBeNull();

    const showCallPrepButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Show call prep"));
    expect(showCallPrepButton).toBeTruthy();

    await act(async () => {
      showCallPrepButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="mock-call-prep"]')).toBeTruthy();
  });
});
