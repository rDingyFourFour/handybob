import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobAskBobAfterCallPanelProps } from "@/components/askbob/JobAskBobAfterCallPanel";

const AFTER_CALL_HYDRATION_HINT =
  "AskBob couldn’t restore the last after-call draft. Generate a new summary to continue.";

function stubComponent({ children }: { children?: ReactNode }) {
  return <div>{children ?? null}</div>;
}

const readAndClearMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/utils/askbob/afterCallCache", () => ({
  readAndClearAskBobAfterCallResult: (...args: unknown[]) => readAndClearMock(...args),
}));

const recordedPanelProps: JobAskBobAfterCallPanelProps[] = [];
vi.mock("@/components/askbob/JobAskBobAfterCallPanel", () => ({
  __esModule: true,
  default: (props: JobAskBobAfterCallPanelProps) => {
    recordedPanelProps.push(props);
    return <div data-testid="after-call-panel" />;
  },
}));

vi.mock("@/components/askbob/JobAskBobContainer", () => ({
  __esModule: true,
  default: stubComponent,
}));
vi.mock("@/components/askbob/AskBobSection", () => ({
  __esModule: true,
  default: stubComponent,
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
vi.mock("@/components/askbob/JobAskBobPanel", () => ({
  __esModule: true,
  default: stubComponent,
}));

import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";

type JobAskBobFlowProps = ComponentProps<typeof JobAskBobFlow>;

describe("JobAskBobFlow after-call cache hydration", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    recordedPanelProps.length = 0;
    readAndClearMock.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
  });

  async function flushReactUpdates(iterations = 5) {
    await act(async () => {
      await Promise.resolve();
      for (let i = 0; i < iterations; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }

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
    afterCallCacheKey: "cache-1",
    afterCallCacheCallId: "call-1",
  };

  const renderFlow = async (overrides: Partial<JobAskBobFlowProps> = {}) =>
    act(async () => {
      root?.render(<JobAskBobFlow {...baseFlowProps} {...overrides} />);
    });

  const findConsoleLogs = (label: string) =>
    logSpy.mock.calls.filter(([name]) => name === label);

  it("hydrates the after-call snapshot when the cache hits", async () => {
    readAndClearMock.mockReturnValue({
      payload: {
        jobId: "job-1",
        callId: "call-1",
        result: {
          afterCallSummary: "Cached summary",
          recommendedActionLabel: "Next move",
          recommendedActionSteps: ["Step one"],
          suggestedChannel: "sms",
          draftMessageBody: "Hey",
          urgencyLevel: "normal",
          notesForTech: null,
          modelLatencyMs: 10,
        },
        createdAtIso: new Date().toISOString(),
      },
      reason: null,
    });

    await renderFlow();
    await flushReactUpdates(20);

    expect(readAndClearMock).toHaveBeenCalledWith("cache-1");
    const hydrationLogs = findConsoleLogs("[askbob-after-call-job-hydrate]");
    expect(hydrationLogs).toHaveLength(1);
    expect(hydrationLogs[0][1]).toMatchObject({
      workspaceId: "workspace-1",
      jobId: "job-1",
      hasAfterCallKey: true,
      hasCallId: true,
      outcome: "hit",
    });
    expect(hydrationLogs[0][1]).not.toHaveProperty("missReason");
    expect(findConsoleLogs("[askbob-after-call-job-hydrate-hit]")).toHaveLength(1);
    const panelProps = recordedPanelProps.at(-1) ?? null;
    expect(panelProps?.initialAfterCallSnapshot?.afterCallSummary).toBe("Cached summary");
    expect(panelProps?.afterCallHydrationHint).toBeNull();
  });

  it("logs an expired miss reason and shows the hint", async () => {
    readAndClearMock.mockReturnValue({
      payload: null,
      reason: "expired",
    });

    await renderFlow();
    await flushReactUpdates(20);

    const hydrationLogs = findConsoleLogs("[askbob-after-call-job-hydrate]");
    expect(hydrationLogs).toHaveLength(1);
    expect(hydrationLogs[0][1]).toMatchObject({
      outcome: "miss",
      missReason: "expired",
    });
    expect(findConsoleLogs("[askbob-after-call-job-hydrate-hit]")).toHaveLength(0);
    const missLogs = findConsoleLogs("[askbob-after-call-job-hydrate-miss]");
    expect(missLogs).toHaveLength(1);
    expect(missLogs[0][1]).toMatchObject({
      reason: "expired",
    });
    const panelProps = recordedPanelProps.at(-1) ?? null;
    expect(panelProps?.afterCallHydrationHint).toBe(AFTER_CALL_HYDRATION_HINT);
  });

  it("logs a wrong_shape miss when the cache payload mismatches", async () => {
    readAndClearMock.mockReturnValue({
      payload: {
        jobId: "job-other",
        callId: "call-other",
        result: {
          afterCallSummary: "Other summary",
          recommendedActionLabel: "Other move",
          recommendedActionSteps: ["Step two"],
          suggestedChannel: "phone",
          draftMessageBody: "Hello",
          urgencyLevel: "normal",
          notesForTech: null,
          modelLatencyMs: 12,
        },
        createdAtIso: new Date().toISOString(),
      },
      reason: null,
    });

    await renderFlow();
    await flushReactUpdates(20);

    const hydrationLogs = findConsoleLogs("[askbob-after-call-job-hydrate]");
    expect(hydrationLogs).toHaveLength(1);
    expect(hydrationLogs[0][1]).toMatchObject({
      outcome: "miss",
      missReason: "wrong_shape",
    });
    expect(findConsoleLogs("[askbob-after-call-job-hydrate-hit]")).toHaveLength(0);
    const missLogs = findConsoleLogs("[askbob-after-call-job-hydrate-miss]");
    expect(missLogs).toHaveLength(1);
    expect(missLogs[0][1]).toMatchObject({
      reason: "mismatch",
    });
    const panelProps = recordedPanelProps.at(-1) ?? null;
    expect(panelProps?.afterCallHydrationHint).toBe(AFTER_CALL_HYDRATION_HINT);
  });

  it("clears call-session drafts when the forced call or job context changes", async () => {
    readAndClearMock.mockReturnValueOnce({
      payload: {
        jobId: "job-1",
        callId: "call-a",
        result: {
          afterCallSummary: "Call A summary",
          recommendedActionLabel: "Move A",
          recommendedActionSteps: ["Step A"],
          suggestedChannel: "sms",
          draftMessageBody: "Hi!",
          urgencyLevel: "normal",
          notesForTech: null,
          modelLatencyMs: 1,
        },
        createdAtIso: new Date().toISOString(),
      },
      reason: null,
    });

    await renderFlow({
      afterCallCacheKey: "cache-a",
      afterCallCacheCallId: "call-a",
      forcedAfterCallCallId: "call-a",
    });
    await flushReactUpdates(20);
    expect(readAndClearMock).toHaveBeenNthCalledWith(1, "cache-a");
    const firstProps = recordedPanelProps.at(-1) ?? null;
    expect(firstProps?.initialAfterCallSnapshot?.afterCallSummary).toBe("Call A summary");

    readAndClearMock.mockReturnValueOnce({ payload: null, reason: "not_found" });
    await renderFlow({
      afterCallCacheKey: "cache-b",
      afterCallCacheCallId: "call-b",
      forcedAfterCallCallId: "call-b",
    });
    await flushReactUpdates(20);
    expect(readAndClearMock).toHaveBeenNthCalledWith(2, "cache-b");
    const secondProps = recordedPanelProps.at(-1) ?? null;
    expect(secondProps?.initialAfterCallSnapshot).toBeUndefined();
    expect(secondProps?.afterCallHydrationHint).toBe(AFTER_CALL_HYDRATION_HINT);

    readAndClearMock.mockReturnValueOnce({ payload: null, reason: "not_found" });
    await renderFlow({
      jobId: "job-2",
      afterCallCacheKey: "cache-c",
      afterCallCacheCallId: "call-c",
      forcedAfterCallCallId: "call-c",
    });
    await flushReactUpdates(20);
    expect(readAndClearMock).toHaveBeenNthCalledWith(3, "cache-c");
    const thirdProps = recordedPanelProps.at(-1) ?? null;
    expect(thirdProps?.initialAfterCallSnapshot).toBeUndefined();
    expect(thirdProps?.afterCallHydrationHint).toBe(AFTER_CALL_HYDRATION_HINT);
  });
});
