import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { JobAskBobAfterCallPanelProps } from "@/components/askbob/JobAskBobAfterCallPanel";

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
      root.unmount();
      root = null;
    }
    container.remove();
    logSpy.mockRestore();
  });

  function flushReactUpdates(iterations = 5) {
    return act(async () => {
      await Promise.resolve();
      for (let i = 0; i < iterations; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }

  it("hydrates the after-call snapshot when cache hits", async () => {
    readAndClearMock.mockReturnValue({
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
    });

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          jobId="job-1"
          userId="user-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15550000001"
          jobDescription="Fix it"
          jobTitle="Job"
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
          initialFollowupSnapshot={null}
          initialAfterCallSnapshot={null}
          lastQuoteSummary={null}
          latestCallLabel={null}
          hasLatestCall={false}
          callHistoryHint={null}
          initialLatestCallOutcome={null}
          callSessionLatestCallOutcome={null}
          afterCallCacheKey="cache-1"
          afterCallCacheCallId="call-1"
        />,
      );
    });

    await flushReactUpdates(20);

    expect(readAndClearMock).toHaveBeenCalledWith("cache-1");
    const hydratedPanelProps = recordedPanelProps.find(
      (props) => props.initialAfterCallSnapshot?.afterCallSummary === "Cached summary",
    );
    expect(hydratedPanelProps?.initialAfterCallSnapshot).toMatchObject({
      afterCallSummary: "Cached summary",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-after-call-job-hydrate-hit]",
      expect.objectContaining({ cacheKey: "cache-1", callId: "call-1" }),
    );
  });
});
