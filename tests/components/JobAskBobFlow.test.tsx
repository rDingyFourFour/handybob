import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";
import { PROGRESS_STEPS } from "@/app/(app)/jobs/[id]/progressSteps";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

let capturedAccordionProps: Record<string, unknown> | null = null;
let capturedFollowupProps: Record<string, unknown> | null = null;
let capturedContainerProps: Record<string, unknown> | null = null;
let capturedMaterialsProps: Record<string, unknown> | null = null;

vi.mock("@/app/(app)/jobs/[id]/JobProgressAccordion", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedAccordionProps = props;
    const rowContent = (props.rowContent ?? {}) as Record<string, React.ReactNode>;
    return (
      <div data-testid="mock-progress-accordion">
        {rowContent.diagnose}
        {rowContent.materials}
        {rowContent.quote}
        {rowContent.followup}
        {rowContent.call}
      </div>
    );
  },
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedFollowupProps = props;
    return <div data-testid="mock-followup" />;
  },
}));

vi.mock("@/components/askbob/JobAskBobContainer", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedContainerProps = props;
    return <div data-testid="mock-container" />;
  },
}));

vi.mock("@/components/askbob/AskBobMaterialsPanel", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedMaterialsProps = props;
    return <div data-testid="mock-materials" />;
  },
}));

describe("JobAskBobFlow wiring", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    capturedAccordionProps = null;
    capturedFollowupProps = null;
    capturedContainerProps = null;
    capturedMaterialsProps = null;
    pushMock.mockClear();
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

  it("renders progress rows and status hints through the accordion", async () => {
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

    expect(capturedAccordionProps).toBeTruthy();
    const steps = ((capturedAccordionProps?.progressSteps as Array<{ key: string }> | undefined) ?? []);
    expect(steps.map((step) => step.key)).toEqual(PROGRESS_STEPS.map((step) => step.key));
    const rowCopyByStep =
      (capturedAccordionProps?.rowCopyByStep as Record<string, {
        stepLabel?: string;
        statusText?: string;
        reviewActionLabel?: string;
      }> | undefined) ?? {};
    for (const step of PROGRESS_STEPS) {
      const copy = rowCopyByStep[step.key];
      expect(copy).toBeTruthy();
      expect(copy?.statusText).toBeDefined();
      expect(copy?.stepLabel).toBeDefined();
    }
    expect(rowCopyByStep.diagnose?.reviewActionLabel).toBe(
      jobDetailsCopy.progressRows.reviewAction,
    );
    const rowContent = capturedAccordionProps?.rowContent as Record<string, unknown> | undefined;
    expect(rowContent?.followup).toBeTruthy();
    expect(rowContent?.call).toBeTruthy();
    expect(capturedAccordionProps?.defaultExpandedStep).toBeNull();
  });

  it("provides the latest call outcome to the follow-up panel and keeps stages intact", async () => {
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

    expect(capturedFollowupProps?.latestCallOutcome).toMatchObject({
      callId: "call-1",
      outcomeCode: "reached_needs_followup",
    });
    const statusItems = (capturedContainerProps?.stageStatusItems ?? []) as Array<{
      label: string;
      status: string;
    }>;
    expect(statusItems.length).toBe(5);
    expect(statusItems.map((item) => item.label)).toEqual([
      "Diagnose",
      "Materials",
      "Quote",
      "Follow-up",
      "Call preparation",
    ]);
    expect(statusItems.map((item) => item.status)).toEqual([
      "not_started",
      "not_started",
      "not_started",
      "drafted",
      "not_started",
    ]);
    expect(capturedFollowupProps?.stepCompleted).toBe(false);
    expect(capturedFollowupProps?.stepCollapsed).toBe(true);
  });

  it("handles materials summary updates without throwing due to missing call script persona setter", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

    expect(capturedMaterialsProps).toBeTruthy();
    const context: MaterialsSummaryContext = { materialsSummary: "Updated summary" };
    await act(async () => {
      expect(() =>
        capturedMaterialsProps?.onMaterialsSummaryChange?.(context),
      ).not.toThrow();
      await Promise.resolve();
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
