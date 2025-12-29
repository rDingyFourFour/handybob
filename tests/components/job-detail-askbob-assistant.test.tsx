import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";

vi.mock("@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction", () => ({
  openOrCreateCallSessionForJobAction: vi.fn(),
}));

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/components/askbob/JobAskBobPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-diagnose" />,
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
  default: () => <div data-testid="mock-scheduler" />,
}));

import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";

const mockOpenCallSessionAction = openOrCreateCallSessionForJobAction as unknown as ReturnType<typeof vi.fn>;

const baseProps = {
  workspaceId: "workspace-1",
  userId: "user-1",
  jobId: "job-1",
  jobTitle: "Fix sink",
  jobDescription: "Leaking pipe",
  customerPhoneNumber: "+15551234567",
};

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

describe("job detail AskBob assistant", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let scrollSpy: ReturnType<typeof vi.spyOn> | null = null;
  let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockOpenCallSessionAction.mockReset();
    mockPush.mockReset();
    originalScrollIntoView = Element.prototype.scrollIntoView;
    if (!originalScrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
    scrollSpy?.mockRestore();
    if (!originalScrollIntoView) {
      delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
    } else {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("scrolls to scheduling when follow-up recommends an appointment", async () => {
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

    const nextActionButton = findButton(container, "Review scheduling options");
    expect(nextActionButton).toBeTruthy();

    await act(async () => {
      nextActionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(scrollSpy).toHaveBeenCalled();
  });

  it("routes to the call session when follow-up recommends calling", async () => {
    mockOpenCallSessionAction.mockResolvedValueOnce({
      ok: true,
      callId: "call-123",
      createdNew: true,
    });

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

    const nextActionButton = findButton(container, callSessionCopy.jobDetail.openCallSessionCta);
    expect(nextActionButton).toBeTruthy();

    await act(async () => {
      nextActionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockOpenCallSessionAction).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/calls/call-123");
  });
});
