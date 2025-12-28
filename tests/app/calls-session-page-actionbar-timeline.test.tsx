import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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

import CallSessionPage from "@/app/(app)/calls/[id]/page";

describe("CallSessionPage action bar and timeline", () => {
  let supabaseState = setupSupabaseMock();
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
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
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("renders timeline and refresh action when Twilio metadata is missing", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          created_at: "2024-01-01T12:00:00.000Z",
          job_id: "job-1",
          customer_id: "customer-1",
          direction: "inbound",
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: "AskBob call script: Follow-up notes",
          ai_summary: null,
          transcript: null,
          twilio_call_sid: null,
          twilio_status: null,
          twilio_status_updated_at: null,
          twilio_error_message: null,
          twilio_error_code: null,
          twilio_recording_url: null,
          twilio_recording_sid: null,
          twilio_recording_duration_seconds: null,
          twilio_recording_received_at: null,
        },
      ],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        {
          id: "job-1",
          title: "Test job",
          status: "open",
          customer_id: "customer-1",
          customers: [{ id: "customer-1", name: "Test Customer", phone: "+15550002222" }],
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };
    supabaseState.responses.askbob_job_task_snapshots = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-1" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('data-testid="call-session-timeline"');
    expect(markup).toContain('data-testid="call-session-action-bar"');
    expect(markup).toContain('data-testid="call-session-action-bar-manual"');
    expect(markup).toContain("Refresh status");
    expect(markup).toContain("Manual call");
    expect(markup).toContain("Manual follow-up SMS");

    const timelineEvent = logSpy.mock.calls.find(
      (args) => args[0] === "[calls-session-timeline-visible]",
    );
    expect(timelineEvent).toBeTruthy();
    const timelinePayload = timelineEvent?.[1] as Record<string, unknown>;
    expect(Object.keys(timelinePayload)).toEqual(
      expect.arrayContaining([
        "workspaceId",
        "callId",
        "direction",
        "hasTwilioSid",
        "hasTwilioStatus",
        "isTerminal",
        "hasOutcome",
        "hasRecordingMetadata",
        "hasRecordingDuration",
        "hasAfterCallDraft",
      ]),
    );

    const manualEscapeEvent = logSpy.mock.calls.find(
      (args) => args[0] === "[calls-session-manual-escape-visible]",
    );
    expect(manualEscapeEvent).toBeTruthy();
    const manualEscapePayload = manualEscapeEvent?.[1] as Record<string, unknown>;
    expect(Object.keys(manualEscapePayload)).toEqual(
      expect.arrayContaining([
        "workspaceId",
        "callId",
        "jobId",
        "customerId",
        "hasCustomerPhone",
        "hasScriptSummary",
      ]),
    );
  });

  it("anchors primary action to outcome capture when terminal but missing outcome", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-terminal",
          workspace_id: "workspace-1",
          created_at: "2024-01-02T12:00:00.000Z",
          job_id: "job-2",
          customer_id: "customer-2",
          direction: "outbound",
          from_number: "+15550003333",
          to_number: "+15550004444",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: "AskBob call script: Quick follow-up",
          ai_summary: null,
          transcript: null,
          twilio_call_sid: "CA-terminal",
          twilio_status: "completed",
          twilio_status_updated_at: "2024-01-02T12:05:00.000Z",
          twilio_error_message: null,
          twilio_error_code: null,
          twilio_recording_url: null,
          twilio_recording_sid: null,
          twilio_recording_duration_seconds: null,
          twilio_recording_received_at: null,
        },
      ],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        {
          id: "job-2",
          title: "Outcome job",
          status: "open",
          customer_id: "customer-2",
          customers: [{ id: "customer-2", name: "Outcome Customer", phone: "+15550004444" }],
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };
    supabaseState.responses.askbob_job_task_snapshots = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-terminal" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('href="#call-outcome-capture"');
    expect(markup).toContain('data-testid="call-session-timeline"');
    expect(markup).toContain('data-testid="call-session-action-bar"');
    expect(markup).toContain('data-testid="call-session-action-bar-manual"');
    expect(markup).toContain("Generate follow-up");
    expect(markup).toContain("disabled");

    const blockingEvent = logSpy.mock.calls.find(
      (args) => args[0] === "[calls-after-call-outcome-blocking-visible]",
    );
    expect(blockingEvent).toBeTruthy();
    const blockingPayload = blockingEvent?.[1] as Record<string, unknown>;
    expect(Object.keys(blockingPayload)).toEqual(
      expect.arrayContaining(["missingReason", "isTerminal", "hasOutcome", "workspaceId", "callId"]),
    );
  });

  it("shows generate follow-up entry points and composer when ready with draft", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-ready",
          workspace_id: "workspace-1",
          created_at: "2024-01-03T12:00:00.000Z",
          job_id: "job-3",
          customer_id: "customer-3",
          direction: "outbound",
          from_number: "+15550005555",
          to_number: "+15550006666",
          outcome: null,
          outcome_notes: "Reached and scheduled",
          outcome_recorded_at: "2024-01-03T12:10:00.000Z",
          outcome_code: "reached_scheduled",
          reached_customer: true,
          summary: "AskBob call script: Wrap-up plan",
          ai_summary: null,
          transcript: null,
          twilio_call_sid: "CA-ready",
          twilio_status: "completed",
          twilio_status_updated_at: "2024-01-03T12:05:00.000Z",
          twilio_error_message: null,
          twilio_error_code: null,
          twilio_recording_url: null,
          twilio_recording_sid: null,
          twilio_recording_duration_seconds: null,
          twilio_recording_received_at: null,
        },
      ],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        {
          id: "job-3",
          title: "Ready job",
          status: "open",
          customer_id: "customer-3",
          customers: [{ id: "customer-3", name: "Ready Customer", phone: "+15550006666" }],
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };
    supabaseState.responses.askbob_job_task_snapshots = {
      data: [
        {
          task: "job.after_call",
          payload: {
            afterCallSummary: "Summary",
            recommendedActionLabel: "Send follow-up",
            recommendedActionSteps: ["Step 1"],
            suggestedChannel: "sms",
            draftMessageBody: "Draft follow-up text",
            urgencyLevel: "normal",
          },
          updated_at: "2024-01-03T12:15:00.000Z",
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-ready" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('href="#askbob-after-call"');
    expect(markup).toContain("Open composer with this draft");
    expect(markup).toContain("Regenerate follow-up");
    expect(markup).toContain("Manual call");
    expect(markup).toContain('data-testid="call-session-action-bar-manual"');
  });
});
