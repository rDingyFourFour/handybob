// Manual smoke: /jobs/{id}
// Manual smoke: /jobs/{id}?afterCallKey=test&callId=test
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockGetJobAskBobHudSummary = vi.fn();
const mockGetJobAskBobSnapshotsForJob = vi.fn();
const mockLoadCallHistoryForJob = vi.fn();
const mockGetLatestCallOutcomeForJob = vi.fn();
const mockRedirect = vi.fn();
const mockNotFound = vi.fn();
let lastJobAskBobFlowProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({
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

vi.mock("@/components/JobDetailsCard", () => ({
  __esModule: true,
  default: () => <div>JobDetailsCard mock</div>,
}));
vi.mock("@/components/askbob/JobAskBobFlow", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    lastJobAskBobFlowProps = props;
    return <div>JobAskBobFlow mock</div>;
  },
}));
vi.mock("@/components/jobs/JobQuotesCard", () => ({
  __esModule: true,
  default: () => <div>JobQuotesCard mock</div>,
}));
vi.mock("@/components/jobs/JobRecentActivityCard", () => ({
  __esModule: true,
  default: () => <div>JobRecentActivityCard mock</div>,
}));

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    resolveWorkspaceContext: () => mockResolveWorkspaceContext(),
  };
});

vi.mock("@/lib/domain/askbob/service", () => ({
  getJobAskBobHudSummary: (...args: unknown[]) => mockGetJobAskBobHudSummary(...args),
  getJobAskBobSnapshotsForJob: (...args: unknown[]) =>
    mockGetJobAskBobSnapshotsForJob(...args),
}));

vi.mock("@/lib/domain/askbob/callHistory", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/askbob/callHistory")>(
    "@/lib/domain/askbob/callHistory",
  );
  return {
    ...actual,
    loadCallHistoryForJob: (...args: unknown[]) => mockLoadCallHistoryForJob(...args),
  };
});

vi.mock("@/lib/domain/calls/latestCallOutcome", () => ({
  getLatestCallOutcomeForJob: (...args: unknown[]) =>
    mockGetLatestCallOutcomeForJob(...args),
}));

import JobDetailPage from "@/app/(app)/jobs/[id]/page";

const JOB_RECORD = {
  id: "job-1",
  title: "Test job",
  status: "open",
  urgency: "medium",
  source: "web",
  ai_urgency: null,
  priority: "high",
  attention_score: 10,
  attention_reason: "Follow up quick",
  description_raw: "Job description",
  created_at: new Date().toISOString(),
  customer_id: "customer-1",
  customers: { id: "customer-1", name: "Test customer", phone: "+1555000000" },
};

const JOB_HEADING = "Scheduled appointments for this job";

let supabaseState = setupSupabaseMock();

type GuardedSearchParams<T> = {
  promise: Promise<T>;
  getDirectAccessCount: () => number;
};

function createGuardedSearchParams<T>(promise: Promise<T>): GuardedSearchParams<T> {
  let directAccessCount = 0;
  return {
    promise: new Proxy(promise, {
      get(target, prop) {
        if (prop === "then") {
          return target.then.bind(target);
        }
        if (prop === "catch") {
          return target.catch.bind(target);
        }
        if (prop === "finally") {
          return target.finally.bind(target);
        }
        if (prop === Symbol.toStringTag) {
          return "Promise";
        }
        directAccessCount += 1;
        throw new Error("searchParams must be awaited before accessing properties");
      },
    }) as Promise<T>,
    getDirectAccessCount: () => directAccessCount,
  };
}

async function renderJobPage(
  searchParams?: Promise<Record<string, string | string[] | undefined> | null>,
) {
  const element = await JobDetailPage({
    params: Promise.resolve({ id: JOB_RECORD.id }),
    searchParams: searchParams ?? Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

  describe("JobDetailPage searchParams handling", () => {
  beforeEach(() => {
    lastJobAskBobFlowProps = null;
    supabaseState = setupSupabaseMock({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReset();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockReset();
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1" },
        role: "owner",
      },
    });
    mockGetJobAskBobHudSummary.mockReset();
    mockGetJobAskBobHudSummary.mockResolvedValue({
      lastTaskLabel: null,
      lastUsedAt: null,
      totalRunsCount: 0,
      tasksSeen: [],
    });
    mockGetJobAskBobSnapshotsForJob.mockReset();
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });
    mockLoadCallHistoryForJob.mockReset();
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockReset();
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
  });

  it("would have crashed if searchParams Promise properties were read synchronously", async () => {
    const guarded = createGuardedSearchParams(
      Promise.resolve({ afterCallKey: "cache-guard", callId: "call-guard" }),
    );
    await expect(renderJobPage(guarded.promise)).resolves.toContain(JOB_HEADING);
  });

  it("does not crash when searchParams resolves to an empty object", async () => {
    const markup = await renderJobPage(Promise.resolve({}));
    expect(markup).toContain(JOB_HEADING);
  });

  it("survives empty afterCall parameters", async () => {
    const markup = await renderJobPage(
      Promise.resolve({ afterCallKey: "", callId: "" }),
    );
    expect(markup).toContain(JOB_HEADING);
  });

  it("renders with afterCall parameters supplied", async () => {
    const markup = await renderJobPage(
      Promise.resolve({ afterCallKey: "cache-1", callId: "call-1" }),
    );
    expect(markup).toContain(JOB_HEADING);
  });

  it("passes normalized afterCall parameters into the AskBob flow", async () => {
    const fixtures: Array<{
      description: string;
      params: Record<string, string | string[] | undefined>;
      expectedKey: string | undefined;
      expectedCallId: string | undefined;
    }> = [
      {
        description: "undefined params",
        params: {},
        expectedKey: undefined,
        expectedCallId: undefined,
      },
      {
        description: "empty strings",
        params: { afterCallKey: "", callId: "" },
        expectedKey: undefined,
        expectedCallId: undefined,
      },
      {
        description: "whitespace strings",
        params: { afterCallKey: "   ", callId: "   " },
        expectedKey: "   ",
        expectedCallId: "   ",
      },
      {
        description: "normal strings",
        params: { afterCallKey: "cache-2", callId: "call-2" },
        expectedKey: "cache-2",
        expectedCallId: "call-2",
      },
      {
        description: "array inputs are ignored",
        params: {
          afterCallKey: ["array1", "array2"],
          callId: ["call-array"],
        },
        expectedKey: undefined,
        expectedCallId: undefined,
      },
    ];

    for (const entry of fixtures) {
      lastJobAskBobFlowProps = null;
      await renderJobPage(Promise.resolve(entry.params));
      expect(lastJobAskBobFlowProps).not.toBeNull();
      expect(lastJobAskBobFlowProps?.afterCallCacheKey).toBe(entry.expectedKey);
      expect(lastJobAskBobFlowProps?.afterCallCacheCallId).toBe(entry.expectedCallId);
    }
  });

  it("redirects to login when unauthenticated", async () => {
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "unauthenticated",
    });

    await renderJobPage(Promise.resolve({}));

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders access denied shell when membership is missing", async () => {
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "no_membership",
    });

    const markup = await renderJobPage(Promise.resolve({}));

    expect(markup).toContain("Access denied");
  });

  it("never touches searchParams before awaiting it", async () => {
    const guarded = createGuardedSearchParams(
      Promise.resolve({ afterCallKey: "guard-key", callId: "guard-call" }),
    );
    await renderJobPage(guarded.promise);
    expect(guarded.getDirectAccessCount()).toBe(0);
  });
});
