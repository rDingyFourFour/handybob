import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

export const createServerClientMock = vi.fn();
export const mockRedirect = vi.fn();
export const mockNotFound = vi.fn();
export const mockResolveWorkspaceContext = vi.fn();
export const mockGetJobAskBobHudSummary = vi.fn();
export const mockGetJobAskBobSnapshotsForJob = vi.fn();
export const mockGetJobAskBobSnapshotHistoryForJob = vi.fn();
export const mockLoadCallHistoryForJob = vi.fn();
export const mockGetLatestCallOutcomeForJob = vi.fn();
export const mockOpenCallSessionAction = vi.fn(async () => ({
  ok: true,
  callId: "call-1",
  createdNew: true,
}));


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

vi.mock("@/components/jobs/JobQuotesCard", () => ({
  __esModule: true,
  default: () => <div>JobQuotesCard mock</div>,
}));

vi.mock("@/components/jobs/JobRecentActivityCard", () => ({
  __esModule: true,
  default: () => <div>JobRecentActivityCard mock</div>,
}));

vi.mock("@/app/(app)/jobs/[id]/JobInvoiceSection", () => ({
  __esModule: true,
  default: () => <div>JobInvoiceSection mock</div>,
}));

vi.mock("@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction", () => ({
  openOrCreateCallSessionForJobAction: (...args: unknown[]) =>
    mockOpenCallSessionAction(...args),
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
  getJobAskBobSnapshotHistoryForJob: (...args: unknown[]) =>
    mockGetJobAskBobSnapshotHistoryForJob(...args),
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

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

import JobDetailPage from "@/app/(app)/jobs/[id]/page";

export const JOB_RECORD = {
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

export const JOB_HEADING = "Scheduled appointments for this job";

export function createSupabaseState(
  initialResponses: Record<string, unknown> = {},
) {
  const supabaseState = setupSupabaseMock(initialResponses);
  createServerClientMock.mockReturnValue(supabaseState.supabase);
  return supabaseState;
}

export async function renderJobDetailPage(
  searchParams?: Promise<Record<string, string | string[] | undefined> | null>,
) {
  const element = await JobDetailPage({
    params: Promise.resolve({ id: JOB_RECORD.id }),
    searchParams: searchParams ?? Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}
