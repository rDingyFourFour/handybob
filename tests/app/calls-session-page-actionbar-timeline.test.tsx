import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

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

describe("CallSessionPage action bar and status strip", () => {
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

  it("renders call control card when Twilio metadata is missing", async () => {
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

    expect(markup).toContain('data-testid="call-control-card"');
    expect(markup).toContain('data-testid="call-control-card-status-strip"');
    expect(markup).toContain('data-testid="call-status-strip"');
    expect(markup).toContain('data-testid="call-session-primary-cta"');
    expect(markup).toContain(callSessionCopy.primaryCta.label.disabled);
    expect(markup).toContain('data-testid="call-workspace-card"');
    expect(markup).toContain('data-testid="call-workspace-panel-unselected"');
    expect(markup).toContain('data-testid="call-wrap-up-card"');
    expect(markup).not.toContain("Agent tools");
    expect(markup).not.toContain('data-testid="call-session-action-bar"');
    expect(markup).not.toContain('data-testid="call-session-timeline"');
    expect(markup).not.toContain('data-testid="call-control-card-timeline"');

    const window = new Window();
    window.document.body.innerHTML = markup;
    const primaryCtas = window.document.querySelectorAll(
      '[data-testid="call-session-primary-cta"]',
    );
    expect(primaryCtas).toHaveLength(1);
    expect(primaryCtas[0]?.textContent).toContain(callSessionCopy.primaryCta.label.disabled);
    expect(primaryCtas[0]?.getAttribute("disabled")).not.toBeNull();

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
        "component",
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

    expect(markup).toContain('data-testid="call-control-card"');
    expect(markup).toContain('data-testid="call-control-card-status-strip"');
    expect(markup).toContain('data-cta-kind="disabled"');
    expect(markup).toContain(callSessionCopy.primaryCta.label.disabled);
    expect(markup).not.toContain('data-testid="call-session-action-bar"');

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

    expect(markup).toContain(callSessionCopy.primaryCta.label.disabled);
    expect(markup).toContain('data-cta-kind="disabled"');
    expect(markup).toContain("Regenerate follow-up");
  });

  it("renders a stable status strip wrapper for empty vs populated milestones", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-empty",
          workspace_id: "workspace-1",
          created_at: null,
          job_id: null,
          customer_id: null,
          direction: "outbound",
          from_number: null,
          to_number: null,
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
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
    supabaseState.responses.jobs = { data: [], error: null };
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };
    supabaseState.responses.askbob_job_task_snapshots = { data: [], error: null };

    const emptyElement = await CallSessionPage({ params: Promise.resolve({ id: "call-empty" }) });
    const emptyMarkup = renderToStaticMarkup(emptyElement);

    supabaseState.responses.calls = {
      data: [
        {
          id: "call-full",
          workspace_id: "workspace-1",
          created_at: "2024-01-01T12:00:00.000Z",
          job_id: "job-1",
          customer_id: "customer-1",
          direction: "outbound",
          from_number: "+15550000000",
          to_number: "+15550000001",
          outcome: "reached",
          outcome_notes: "Notes",
          outcome_recorded_at: "2024-01-01T12:10:00.000Z",
          outcome_code: "reached_scheduled",
          reached_customer: true,
          summary: "AskBob call script: Summary",
          ai_summary: null,
          transcript: null,
          twilio_call_sid: "CA-123",
          twilio_status: "completed",
          twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
          twilio_error_message: null,
          twilio_error_code: null,
          twilio_recording_url: "https://example.com/recording.mp3",
          twilio_recording_sid: "RE123",
          twilio_recording_duration_seconds: 32,
          twilio_recording_received_at: "2024-01-01T12:06:00.000Z",
        },
      ],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        {
          id: "job-1",
          title: "Job",
          status: "open",
          customer_id: "customer-1",
          customers: [{ id: "customer-1", name: "Customer", phone: "+15550000001" }],
        },
      ],
      error: null,
    };

    const fullElement = await CallSessionPage({ params: Promise.resolve({ id: "call-full" }) });
    const fullMarkup = renderToStaticMarkup(fullElement);

    const emptyWindow = new Window();
    emptyWindow.document.body.innerHTML = emptyMarkup;
    const fullWindow = new Window();
    fullWindow.document.body.innerHTML = fullMarkup;

    const emptyWrapper = emptyWindow.document.querySelector('[data-testid="call-status-strip"]');
    const fullWrapper = fullWindow.document.querySelector('[data-testid="call-status-strip"]');
    expect(emptyWrapper?.tagName).toBe(fullWrapper?.tagName);

    const emptyItems = emptyWindow.document.querySelectorAll(
      '[data-testid^="call-status-strip-"]',
    );
    const fullItems = fullWindow.document.querySelectorAll(
      '[data-testid^="call-status-strip-"]',
    );
    expect(emptyItems).toHaveLength(fullItems.length);
  });
});
