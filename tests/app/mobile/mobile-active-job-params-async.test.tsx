import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupabaseState,
  mockGetCurrentWorkspace,
  mockGetJobAskBobSnapshotsForJob,
  mockLoadCallHistoryForJob,
  mockGetLatestCallOutcomeForJob,
  mockGetInvoiceForJob,
} from "@/tests/app/mobile/test-helpers";
import MobileActiveJobPage from "@/app/m/jobs/[id]/page";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

const JOB_RECORD = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Active job",
  status: "open",
  customer_id: "customer-1",
  customers: { id: "customer-1", name: "Acme Inc." },
};

type GuardedParams<T> = {
  promise: Promise<T>;
  getDirectAccessCount: () => number;
};

function createGuardedParams<T>(value: T): GuardedParams<T> {
  let directAccessCount = 0;
  const proxied = new Proxy(Promise.resolve(value), {
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
      throw new Error("params must be awaited before accessing properties");
    },
  });
  return {
    promise: proxied as Promise<T>,
    getDirectAccessCount: () => directAccessCount,
  };
}

describe("Mobile active job params async guard", () => {
  beforeEach(() => {
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test", owner_id: "owner-1" },
      role: "owner",
    });
    mockGetJobAskBobSnapshotsForJob.mockReset().mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });
    mockLoadCallHistoryForJob.mockReset().mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockReset().mockResolvedValue(null);
    mockGetInvoiceForJob.mockReset().mockResolvedValue({
      invoice: null,
      error: null,
    });
  });

  it("awaits params and only queries jobs with a validated uuid", async () => {
    const supabaseState = createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };

    const guardedParams = createGuardedParams({ id: JOB_RECORD.id });
    const markup = renderToStaticMarkup(
      await MobileActiveJobPage({ params: guardedParams.promise }),
    );

    expect(markup).toContain(JOB_RECORD.title);
    expect(guardedParams.getDirectAccessCount()).toBe(0);

    const jobQuery = supabaseState.queries.jobs;
    expect(jobQuery).toBeDefined();
    const idCall = jobQuery.eq.mock.calls.find(([column]) => column === "id");
    expect(idCall?.[1]).toBe(JOB_RECORD.id);
  });

  it("renders the not-found state without invoking the job query for invalid ids", async () => {
    const supabaseState = createSupabaseState({
      jobs: { data: [], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };

    const guardedParams = createGuardedParams({ id: "undefined" });
    const markup = renderToStaticMarkup(
      await MobileActiveJobPage({ params: guardedParams.promise }),
    );

    expect(markup).toContain(mobileFlowCopy.activeJob.notFoundTitle);
    expect(markup).toContain(mobileFlowCopy.activeJob.notFoundBody);
    expect(guardedParams.getDirectAccessCount()).toBe(0);
    expect(supabaseState.queries.jobs).toBeUndefined();
  });
});
