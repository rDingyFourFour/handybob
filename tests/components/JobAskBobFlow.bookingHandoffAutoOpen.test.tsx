import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_BOOKING_HANDOFF_SESSION_KEY,
  type PublicBookingHandoffSignal,
} from "@/lib/domain/publicBookingHandoff";

function stubComponent({ children }: { children?: ReactNode }) {
  return <div>{children ?? null}</div>;
}

let capturedDiagnoseProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/askbob/AskBobSection", () => ({
  __esModule: true,
  default: ({ id, children }: { id: string; children?: ReactNode }) => (
    <section id={id}>{children ?? null}</section>
  ),
}));

vi.mock("@/components/askbob/JobAskBobPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedDiagnoseProps = props;
    return <div data-testid="askbob-diagnose-panel" data-collapsed={String(props.stepCollapsed)} />;
  },
}));

vi.mock("@/components/askbob/AskBobMaterialsPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/AskBobQuotePanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/AskBobSchedulerPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/JobAskBobAfterCallPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/AskBobAutomatedCallPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/JobAskBobContainer", () => ({
  __esModule: true,
  default: stubComponent,
}));

import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";

type JobAskBobFlowProps = ComponentProps<typeof JobAskBobFlow>;

describe("JobAskBobFlow booking handoff auto-open", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let scrollSpy: ReturnType<typeof vi.spyOn> | null = null;
  let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined;

  const baseFlowProps: JobAskBobFlowProps = {
    workspaceId: "workspace-1",
    jobId: "job-1",
    userId: "user-1",
    customerId: "customer-1",
    customerDisplayName: "Customer",
    customerPhoneNumber: "+15550000001",
    jobDescription: "Fix it",
    jobTitle: "Job",
    askBobLastTaskLabel: null,
    askBobLastUsedAtDisplay: null,
    askBobLastUsedAtIso: null,
    askBobRunsSummary: null,
    initialLastQuoteId: null,
    lastQuoteCreatedAt: null,
    lastQuoteCreatedAtFriendly: null,
    initialDiagnoseSnapshot: null,
    initialMaterialsSnapshot: null,
    initialQuoteSnapshot: null,
    initialFollowupSnapshot: null,
    initialAfterCallSnapshot: null,
    lastQuoteSummary: null,
    latestCallLabel: null,
    hasLatestCall: false,
    callHistoryHint: null,
    latestCallOutcome: null,
    callSessionLatestCallOutcome: null,
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    capturedDiagnoseProps = null;
    window.sessionStorage.clear();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
    logSpy.mockRestore();
    scrollSpy?.mockRestore();
    if (!originalScrollIntoView) {
      delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
    } else {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  async function flushReactUpdates(iterations = 4) {
    await act(async () => {
      await Promise.resolve();
      for (let i = 0; i < iterations; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }

  const renderFlow = async (overrides: Partial<JobAskBobFlowProps> = {}) =>
    act(async () => {
      root?.render(<JobAskBobFlow {...baseFlowProps} {...overrides} />);
    });

  const findLogs = (label: string) => logSpy.mock.calls.filter(([name]) => name === label);

  it("auto-opens Step 1 and clears the handoff signal", async () => {
    const signal: PublicBookingHandoffSignal = {
      jobId: "job-1",
      createdAt: Date.now(),
      source: "public_booking_owner_handoff",
      desiredStep: 1,
    };
    window.sessionStorage.setItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY, JSON.stringify(signal));

    await renderFlow();
    await flushReactUpdates();

    expect(findLogs("[public-booking-owner-handoff-askbob-autostart-detected]")).toHaveLength(1);
    expect(findLogs("[public-booking-owner-handoff-askbob-autostart-applied]")).toHaveLength(1);
    expect(window.sessionStorage.getItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY)).toBeNull();
    expect(scrollSpy).toHaveBeenCalled();
    expect(capturedDiagnoseProps?.stepCollapsed).toBe(false);
  });

  it("ignores mismatched job ids", async () => {
    const signal: PublicBookingHandoffSignal = {
      jobId: "job-2",
      createdAt: Date.now(),
      source: "public_booking_owner_handoff",
      desiredStep: 1,
    };
    window.sessionStorage.setItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY, JSON.stringify(signal));

    await renderFlow();
    await flushReactUpdates();

    const ignored = findLogs("[public-booking-owner-handoff-askbob-autostart-ignored]");
    expect(ignored).toHaveLength(1);
    expect(ignored[0][1]).toMatchObject({ reason: "wrong_job" });
  });

  it("ignores stale handoff signals", async () => {
    const signal: PublicBookingHandoffSignal = {
      jobId: "job-1",
      createdAt: Date.now() - 16 * 60 * 1000,
      source: "public_booking_owner_handoff",
      desiredStep: 1,
    };
    window.sessionStorage.setItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY, JSON.stringify(signal));

    await renderFlow();
    await flushReactUpdates();

    const ignored = findLogs("[public-booking-owner-handoff-askbob-autostart-ignored]");
    expect(ignored).toHaveLength(1);
    expect(ignored[0][1]).toMatchObject({ reason: "stale" });
  });

  it("ignores malformed payloads without crashing", async () => {
    window.sessionStorage.setItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY, "not-json");

    await renderFlow();
    await flushReactUpdates();

    const ignored = findLogs("[public-booking-owner-handoff-askbob-autostart-ignored]");
    expect(ignored).toHaveLength(1);
    expect(ignored[0][1]).toMatchObject({ reason: "parse_failed" });
  });
});
