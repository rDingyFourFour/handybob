import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

import CallSessionPage from "@/app/(app)/calls/[id]/page";

describe("CallSessionPage outcome card", () => {
  let supabaseState = setupSupabaseMock();
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("shows the record prompt when no outcome exists", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-1" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Reached customer");
    expect(markup).toContain("Save outcome");
  });

  it("renders the edited summary when an outcome exists", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-2",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550003333",
          to_number: "+15550004444",
          outcome: "reached",
          outcome_notes: "Scheduled a follow-up visit",
          outcome_recorded_at: new Date().toISOString(),
          outcome_code: "reached_scheduled",
          reached_customer: true,
          summary: "AskBob automated call script: test",
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-2" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Outcome recorded");
    expect(markup).toContain("Reached: Yes");
    expect(markup).toContain("Outcome: Reached · Scheduled");
    expect(markup).toContain("Edit outcome");
  });

  it("shows the AskBob call strip when appropriate", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-3",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: "AskBob automated call script: Hi customer, follow up",
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-3" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Prepared call script for this job");
  });

  it("does not render the AskBob call strip without the script", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-4",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550003333",
          to_number: "+15550004444",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-4" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).not.toContain("Prepared call script for this job");
  });

  it("shows Twilio status and error banner when Twilio data exists", async () => {
    const now = new Date().toISOString();
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-5",
          workspace_id: "workspace-1",
          created_at: now,
          job_id: null,
          from_number: "+15550005555",
          to_number: "+15550006666",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: "sid-1",
          twilio_status: "ringing",
          twilio_status_updated_at: now,
          twilio_error_message: "Invalid destination number",
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-5" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Twilio status");
    expect(markup).toContain("Ringing");
    expect(markup).toContain("Call failed");
    expect(markup).toContain("Invalid destination number");
    expect(markup).toContain("Refresh status");
  });

  it("renders the Twilio status strip when only the SID exists", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-6",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550005555",
          to_number: "+15550006666",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: "sid-2",
          twilio_status: null,
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-6" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Twilio status");
    expect(markup).toContain("Queued");
    expect(markup).toContain("Refresh status");
  });

  it("renders the Twilio status strip when only the status exists", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-7",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550005555",
          to_number: "+15550006666",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: null,
          twilio_status: "completed",
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-7" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Twilio status");
    expect(markup).toContain("Completed");
    expect(markup).toContain("Refresh status");
  });

  it("hides the refresh control when no Twilio status or SID exists", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-8",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550005555",
          to_number: "+15550006666",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: null,
          twilio_status: null,
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-8" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).not.toContain("Twilio status");
    expect(markup).not.toContain("Refresh status");
  });

  it("renders a recording pending card when the Twilio call has no recording yet", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-9",
          workspace_id: "workspace-1",
          created_at: new Date().toISOString(),
          job_id: null,
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: "sid-pending-1",
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-9" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Recording pending");
    expect(markup).toContain("A recording will appear here after the call completes.");
    expect(
      logSpy.mock.calls.some(
        (args) =>
          args[0] === "[calls-session-recording-visible]" && args[1]?.recordingState === "pending",
      ),
    ).toBe(true);
  });

  it("renders the recording link when a recording exists", async () => {
    const now = new Date().toISOString();
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-10",
          workspace_id: "workspace-1",
          created_at: now,
          job_id: null,
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: "sid-available-1",
          twilio_recording_url: "https://example.com/recording.mp3",
          twilio_recording_duration_seconds: 85,
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-10" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Recording available");
    expect(markup).toContain("Duration 1m 25s");
    expect(markup).toContain("Open recording");
    expect(markup).toContain('href="/api/calls/recording/call-10"');
    expect(
      logSpy.mock.calls.some(
        (args) =>
          args[0] === "[calls-session-recording-visible]" && args[1]?.recordingState === "available",
      ),
    ).toBe(true);
  });

  it("suggests refreshing when recording metadata exists but duration is still null", async () => {
    const now = new Date().toISOString();
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-11",
          workspace_id: "workspace-1",
          created_at: now,
          job_id: null,
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          twilio_call_sid: "sid-available-2",
          twilio_recording_url: "https://example.com/recording.mp3",
          twilio_recording_duration_seconds: null,
        },
      ],
      error: null,
    };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-11" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Recording available");
    expect(markup).toContain("If this fails, refresh in a minute");
  });
});
