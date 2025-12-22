import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { SPEECH_PLAN_METADATA_MARKER } from "@/lib/domain/askbob/speechPlan";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
  }),
}));

describe("CallSessionPage automated call view", () => {
  let supabaseState = setupSupabaseMock();
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    consoleLogSpy = vi.spyOn(console, "log");
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("renders the automated call details strip with placeholders and notes card", async () => {
    const metadata = {
      voice: "unknown",
      greetingStyle: "Friendly",
      allowVoicemail: true,
    };
    const summary = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} Custom script${SPEECH_PLAN_METADATA_MARKER}${JSON.stringify(
      metadata,
    )}`;

    supabaseState.responses.calls = {
      data: [
        {
          id: "call-auto",
          workspace_id: "workspace-1",
          created_at: "2024-01-01T12:00:00.000Z",
          job_id: "job-1",
          customer_id: "customer-1",
          direction: "outbound",
          from_number: "+10000000000",
          to_number: "+10000000001",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary,
          ai_summary: null,
          transcript: "Initial transcript note",
          twilio_call_sid: "CA123",
          twilio_status: "completed",
          twilio_status_updated_at: "2024-01-01T12:00:05.000Z",
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
    supabaseState.responses.customers = {
      data: [
        { id: "customer-1", name: "Test Customer", phone: "+10000000001" },
      ],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        { id: "job-1", title: "Automation job", status: "open", customer_id: "customer-1", customers: [] },
      ],
      error: null,
    };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-auto" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Automated call");
    expect(markup).toContain("Not available");
    expect(markup).toContain("Enabled");
    expect(markup).toContain("Open job");
    expect(markup).toContain("Open AskBob on job");
    expect(markup).toContain("Automated call notes");

    const detailEvents = consoleLogSpy.mock.calls.filter(
      (args) => args[0] === "[calls-session-askbob-automated-details-visible]",
    );
    expect(detailEvents).toHaveLength(1);
  });

  it("renders Twilio status, recording, and outcome-required banners when gates are met", async () => {
    const metadata = {
      voice: "Samantha",
      greetingStyle: "Professional",
      allowVoicemail: true,
      scriptSummary: "Follow-up script",
    };
    const summary = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} Follow-up script${SPEECH_PLAN_METADATA_MARKER}${JSON.stringify(
      metadata,
    )}`;

    supabaseState.responses.calls = {
      data: [
        {
          id: "call-auto-strip",
          workspace_id: "workspace-1",
          created_at: "2024-01-03T12:00:00.000Z",
          job_id: "job-1",
          customer_id: "customer-1",
          direction: "outbound",
          from_number: "+10000000004",
          to_number: "+10000000005",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary,
          ai_summary: null,
          transcript: null,
          twilio_call_sid: "CA456",
          twilio_status: "completed",
          twilio_status_updated_at: "2024-01-03T12:00:05.000Z",
          twilio_error_message: null,
          twilio_error_code: null,
          twilio_recording_url: "https://example.com/recording.mp3",
          twilio_recording_sid: "RE123",
          twilio_recording_duration_seconds: 32,
          twilio_recording_received_at: "2024-01-03T12:01:05.000Z",
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = {
      data: [{ id: "customer-1", name: "Test Customer", phone: "+10000000005" }],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        { id: "job-1", title: "Automation job", status: "open", customer_id: "customer-1", customers: [] },
      ],
      error: null,
    };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-auto-strip" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Automated call");
    expect(markup).toContain("Twilio status");
    expect(markup).toContain("Recording available");
    expect(markup).toContain("Call ended. Record outcome to generate a follow-up.");
  });

  it("hides the automated call strip and notes card when metadata is absent", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-basic",
          workspace_id: "workspace-1",
          created_at: "2024-01-02T12:00:00.000Z",
          job_id: null,
          customer_id: null,
          direction: "outbound",
          from_number: "+10000000002",
          to_number: "+10000000003",
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
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.jobs = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-basic" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).not.toContain("Automated call");
    expect(markup).not.toContain("Twilio status");
    expect(markup).not.toContain("Recording");
    expect(markup).not.toContain("Call ended. Record outcome to generate a follow-up.");
    expect(markup).not.toContain("Automated call notes");
    const detailEvents = consoleLogSpy.mock.calls.filter(
      (args) => args[0] === "[calls-session-askbob-automated-details-visible]",
    );
    expect(detailEvents).toHaveLength(0);
  });
});
