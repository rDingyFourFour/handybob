import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockRunAskBobTask = vi.fn();
const mockLoadCallHistoryForJob = vi.fn();
const mockComputeCallSummarySignals = vi.fn();

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
  runAskBobTask: (...args: unknown[]) => mockRunAskBobTask(...args),
}));

vi.mock("@/lib/domain/askbob/callHistory", () => ({
  loadCallHistoryForJob: (...args: unknown[]) => mockLoadCallHistoryForJob(...args),
  computeCallSummarySignals: (...args: unknown[]) => mockComputeCallSummarySignals(...args),
}));

import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";

const jobRow = {
  id: "job-1",
  workspace_id: "workspace-1",
  customer_id: "customer-1",
  title: "Job Title",
  description_raw: "Job description",
  status: "open",
};

const defaultResponses = {
  jobs: { data: [jobRow], error: null },
  messages: { data: [{ id: "msg-1", created_at: "2025-01-01T00:00:00Z", sent_at: null }], error: null },
  quotes: { data: [], error: null },
  invoices: { data: [], error: null },
  appointments: { data: [], error: null },
};

const askBobFollowupResult = {
  recommendedAction: "Call to confirm",
  rationale: "Because it's time to call",
  steps: [],
  shouldSendMessage: false,
  shouldScheduleVisit: false,
  shouldCall: true,
  shouldWait: false,
  suggestedChannel: "phone" as const,
  suggestedDelayDays: null,
  riskNotes: null,
  callRecommended: true,
  callPurpose: "Explain quote",
  callTone: "friendly",
  callUrgencyLabel: "Follow up",
  modelLatencyMs: 150,
};

beforeEach(() => {
  vi.clearAllMocks();
  const supabaseState = setupSupabaseMock({ ...defaultResponses });
  createServerClientMock.mockReturnValue(supabaseState.supabase);
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
  mockRunAskBobTask.mockResolvedValue(askBobFollowupResult);
  mockLoadCallHistoryForJob.mockResolvedValue([]);
  mockComputeCallSummarySignals.mockReturnValue({
    totalAttempts: 0,
    answeredCount: 0,
    voicemailCount: 0,
    lastOutcome: null,
    lastAttemptAt: null,
    bestGuessRetryWindow: null,
  });
});

describe("runAskBobJobFollowupAction", () => {
  it("logs the latest call outcome flags when an outcome is supplied", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const payload = {
      workspaceId: "workspace-1",
      jobId: "job-1",
      extraDetails: null,
      jobTitle: null,
      jobDescription: null,
      diagnosisSummary: null,
      materialsSummary: null,
      hasQuoteContextForFollowup: false,
      hasAskBobAppointment: false,
      latestCallOutcome: {
        callId: "call-1",
        occurredAt: "2025-01-01T10:00:00Z",
        reachedCustomer: true,
        outcomeCode: "reached_needs_followup",
        outcomeNotes: "Left notes",
        isAskBobAssisted: false,
      },
      latestCallOutcomeContext: null,
    };

    const response = await runAskBobJobFollowupAction(payload);

    expect(response.ok).toBe(true);

    const requestLog = logSpy.mock.calls.find((call) => call[0] === "[askbob-job-followup-ui-request]");
    expect(requestLog?.[1]).toEqual(
      expect.objectContaining({
        hasLatestCallOutcome: true,
        hasLatestCallOutcomeCode: true,
      }),
    );
    const successLog = logSpy.mock.calls.find((call) => call[0] === "[askbob-job-followup-ui-success]");
    expect(successLog?.[1]).toEqual(
      expect.objectContaining({
        hasLatestCallOutcome: true,
        hasLatestCallOutcomeCode: true,
      }),
    );

    logSpy.mockRestore();
  });
});
