import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockGetJobAskBobHudSummary = vi.fn();
const mockGetJobAskBobSnapshotsForJob = vi.fn();
const mockLoadCallHistoryForJob = vi.fn();
const mockGetLatestCallOutcomeForJob = vi.fn();
const mockRedirect = vi.fn();
const mockNotFound = vi.fn();

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
  default: () => <div>JobAskBobFlow mock</div>,
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

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

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
  title: "Fixture install",
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

async function renderJobDetail() {
  const element = await JobDetailPage({
    params: Promise.resolve({ id: JOB_RECORD.id }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

describe("Job detail invoice section", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [], error: null },
      invoices: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReset();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
      role: "owner",
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

  it("shows the no-applied-quote state", async () => {
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.invoices = { data: [], error: null };

    const markup = await renderJobDetail();

    expect(markup).toContain("Accept a quote to create an invoice.");
    expect(markup).toContain("Create invoice from accepted quote");
  });

  it("shows the create invoice CTA when an applied quote exists", async () => {
    supabaseState.responses.quotes = {
      data: [{ id: "quote-1", job_id: "job-1", status: "accepted", total: 200, created_at: new Date().toISOString(), smart_quote_used: false }],
      error: null,
    };
    supabaseState.responses.invoices = { data: [], error: null };

    const markup = await renderJobDetail();

    expect(markup).toContain("Create invoice from accepted quote");
  });

  it("renders the invoice snapshot totals when an invoice exists", async () => {
    const invoiceRow = {
      id: "invoice-1",
      quote_id: "quote-1",
      created_at: new Date().toISOString(),
      total_cents: 9900,
      tax_total_cents: 900,
      labor_total_cents: 9000,
      materials_total_cents: 0,
      trip_fee_cents: 0,
      currency: "USD",
    };

    supabaseState.responses.quotes = [
      {
        data: [
          {
            id: "quote-1",
            job_id: "job-1",
            status: "accepted",
            total: 250,
            created_at: new Date().toISOString(),
            smart_quote_used: false,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "quote-1",
            job_id: "job-1",
            status: "accepted",
            total: 310,
            created_at: new Date().toISOString(),
            smart_quote_used: false,
          },
        ],
        error: null,
      },
    ];
    supabaseState.responses.invoices = [
      { data: [invoiceRow], error: null },
      { data: [invoiceRow], error: null },
    ];

    const firstMarkup = await renderJobDetail();
    const secondMarkup = await renderJobDetail();

    expect(firstMarkup).toContain("Invoice created");
    expect(firstMarkup).toContain("$99.00");
    expect(firstMarkup).not.toContain("$250.00");
    expect(firstMarkup).toContain("View invoice");
    expect(firstMarkup).not.toContain("Create invoice from accepted quote");

    expect(secondMarkup).toContain("Invoice created");
    expect(secondMarkup).toContain("$99.00");
    expect(secondMarkup).not.toContain("$310.00");
  });
});
