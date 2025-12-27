import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const PUBLIC_SUBMISSION = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  jobId: "job-lead-1",
  title: "Fix leaking sink",
  descriptionRaw: "Kitchen sink is leaking under the cabinet.",
  status: "lead",
};

const JOB_RECORD = {
  id: PUBLIC_SUBMISSION.jobId,
  title: PUBLIC_SUBMISSION.title,
  status: PUBLIC_SUBMISSION.status,
  urgency: "this_week",
  source: "web_form",
  ai_urgency: null,
  priority: "normal",
  attention_score: null,
  attention_reason: null,
  description_raw: PUBLIC_SUBMISSION.descriptionRaw,
  created_at: "2024-01-01T00:00:00.000Z",
  customer_id: PUBLIC_SUBMISSION.customerId,
  customers: { id: PUBLIC_SUBMISSION.customerId, name: "Jamie Customer", phone: "+15551234567" },
};

describe("public booking to AskBob regression", () => {
  let lastJobAskBobFlowProps: Record<string, unknown> | null = null;
  const createServerClientMock = vi.fn();
  const mockResolveWorkspaceContext = vi.fn();
  const mockGetJobAskBobHudSummary = vi.fn();
  const mockGetJobAskBobSnapshotsForJob = vi.fn();
  const mockLoadCallHistoryForJob = vi.fn();
  const mockGetLatestCallOutcomeForJob = vi.fn();
  const mockRedirect = vi.fn();
  const mockNotFound = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    lastJobAskBobFlowProps = null;
    mockRedirect.mockReset();
    mockNotFound.mockReset();
    mockResolveWorkspaceContext.mockReset();
    mockGetJobAskBobHudSummary.mockReset();
    mockGetJobAskBobSnapshotsForJob.mockReset();
    mockLoadCallHistoryForJob.mockReset();
    mockGetLatestCallOutcomeForJob.mockReset();
    createServerClientMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderJobDetail(jobData: typeof JOB_RECORD | null) {
    const supabaseState = setupSupabaseMock({
      jobs: { data: jobData ? [jobData] : [], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: PUBLIC_SUBMISSION.workspaceId,
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: PUBLIC_SUBMISSION.workspaceId },
        role: "owner",
      },
    });
    mockGetJobAskBobHudSummary.mockResolvedValue({
      lastTaskLabel: null,
      lastUsedAt: null,
      totalRunsCount: 0,
      tasksSeen: [],
    });
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);

    vi.doMock("next/navigation", () => ({
      useRouter: () => ({
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
        push: vi.fn(),
        replace: vi.fn(),
      }),
      redirect: (url: string) => mockRedirect(url),
      notFound: () => mockNotFound(),
    }));

    vi.doMock("@/components/JobDetailsCard", () => ({
      __esModule: true,
      default: () => <div>JobDetailsCard mock</div>,
    }));
    vi.doMock("@/components/askbob/JobAskBobFlow", () => ({
      __esModule: true,
      default: (props: Record<string, unknown>) => {
        lastJobAskBobFlowProps = props;
        return <div>JobAskBobFlow mock</div>;
      },
    }));
    vi.doMock("@/components/jobs/JobQuotesCard", () => ({
      __esModule: true,
      default: () => <div>JobQuotesCard mock</div>,
    }));
    vi.doMock("@/components/jobs/JobRecentActivityCard", () => ({
      __esModule: true,
      default: () => <div>JobRecentActivityCard mock</div>,
    }));
    vi.doMock("@/app/(app)/jobs/[id]/JobInvoiceSection", () => ({
      __esModule: true,
      default: () => <div>JobInvoiceSection mock</div>,
    }));
    vi.doMock("@/utils/supabase/server", () => ({
      createServerClient: () => createServerClientMock(),
    }));
    vi.doMock("@/lib/domain/workspaces", async () => {
      const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
        "@/lib/domain/workspaces",
      );
      return {
        ...actual,
        resolveWorkspaceContext: () => mockResolveWorkspaceContext(),
      };
    });
    vi.doMock("@/lib/domain/askbob/service", () => ({
      getJobAskBobHudSummary: (...args: unknown[]) => mockGetJobAskBobHudSummary(...args),
      getJobAskBobSnapshotsForJob: (...args: unknown[]) =>
        mockGetJobAskBobSnapshotsForJob(...args),
    }));
    vi.doMock("@/lib/domain/askbob/callHistory", async () => {
      const actual = await vi.importActual<typeof import("@/lib/domain/askbob/callHistory")>(
        "@/lib/domain/askbob/callHistory",
      );
      return {
        ...actual,
        loadCallHistoryForJob: (...args: unknown[]) => mockLoadCallHistoryForJob(...args),
      };
    });
    vi.doMock("@/lib/domain/calls/latestCallOutcome", () => ({
      getLatestCallOutcomeForJob: (...args: unknown[]) =>
        mockGetLatestCallOutcomeForJob(...args),
    }));

    const { default: JobDetailPage } = await import("@/app/(app)/jobs/[id]/page");
    const element = await JobDetailPage({
      params: Promise.resolve({ id: PUBLIC_SUBMISSION.jobId }),
      searchParams: Promise.resolve({}),
    });
    return renderToStaticMarkup(element);
  }

  it("renders a lead job created by public intake with AskBob title/description", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const markup = await renderJobDetail(JOB_RECORD);

    expect(markup).toContain("JobDetailsCard mock");
    expect(lastJobAskBobFlowProps).not.toBeNull();
    expect(lastJobAskBobFlowProps?.jobTitle).toBe(PUBLIC_SUBMISSION.title);
    expect(lastJobAskBobFlowProps?.jobDescription).toBe(PUBLIC_SUBMISSION.descriptionRaw);

    const logCalls = logSpy.mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[jobs-detail-lead-job-loaded]" &&
          payload.workspaceId === PUBLIC_SUBMISSION.workspaceId &&
          payload.jobId === PUBLIC_SUBMISSION.jobId &&
          payload.hasTitle === true &&
          payload.hasDescriptionRaw === true &&
          payload.hasCustomerId === true,
      ),
    ).toBe(true);
  });

  it("does not mount AskBob when the job is not in the workspace", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const markup = await renderJobDetail(null);

    expect(markup).toContain("Job not found");
    expect(lastJobAskBobFlowProps).toBeNull();
    expect(
      logSpy.mock.calls.some(([label]) => label === "[askbob-lead-job-flow-mounted]"),
    ).toBe(false);
  });
});

describe("JobAskBobFlow lead logging", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/components/askbob/JobAskBobFlow");
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
    vi.restoreAllMocks();
  });

  it("emits a lead mount log when AskBob loads a lead job", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.doMock("next/navigation", () => ({
      useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
      }),
    }));
    vi.doMock("@/components/askbob/AskBobCallAssistPanel", () => ({
      __esModule: true,
      default: () => <div data-testid="mock-call-assist" />,
    }));
    vi.doMock("@/components/askbob/JobAskBobFollowupPanel", () => ({
      __esModule: true,
      default: () => <div data-testid="mock-followup" />,
    }));
    vi.doMock("@/components/askbob/JobAskBobContainer", () => ({
      __esModule: true,
      default: () => <div data-testid="mock-container" />,
    }));
    vi.doMock("@/components/askbob/AskBobAutomatedCallPanel", () => ({
      __esModule: true,
      default: () => <div data-testid="mock-automated-call" />,
    }));

    const { default: JobAskBobFlow } = await import("@/components/askbob/JobAskBobFlow");
    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId={PUBLIC_SUBMISSION.workspaceId}
          userId="user-1"
          jobId={PUBLIC_SUBMISSION.jobId}
          customerId={PUBLIC_SUBMISSION.customerId}
          customerDisplayName="Jamie Customer"
          customerPhoneNumber="+15551234567"
          jobDescription={PUBLIC_SUBMISSION.descriptionRaw}
          jobTitle={PUBLIC_SUBMISSION.title}
          jobStatus={PUBLIC_SUBMISSION.status}
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
          lastQuoteSummary={null}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const logCalls = logSpy.mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[askbob-lead-job-flow-mounted]" &&
          payload.workspaceId === PUBLIC_SUBMISSION.workspaceId &&
          payload.jobId === PUBLIC_SUBMISSION.jobId &&
          payload.hasJobTitle === true &&
          payload.hasJobDescription === true,
      ),
    ).toBe(true);
  });
});
