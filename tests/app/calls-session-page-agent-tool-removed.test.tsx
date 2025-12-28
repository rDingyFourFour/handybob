import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { SPEECH_PLAN_METADATA_MARKER } from "@/lib/domain/askbob/speechPlan";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
  }),
}));

function buildAutomatedCallSummary() {
  const metadata = JSON.stringify({
    voice: "Samantha",
    greetingStyle: "Professional",
    allowVoicemail: true,
    scriptSummary: "Quick follow-up script",
  });
  return `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} Quick follow-up${SPEECH_PLAN_METADATA_MARKER}${metadata}`;
}

describe("CallSessionPage agent tools removal", () => {
  let supabaseState = setupSupabaseMock();

  const baseCall = {
    id: "call-1",
    workspace_id: "workspace-1",
    created_at: "2024-01-01T12:00:00.000Z",
    job_id: "job-1",
    customer_id: "customer-1",
    direction: "outbound",
    from_number: "+15550001111",
    to_number: "+15550002222",
    outcome: null,
    outcome_notes: "Reached and scheduled",
    outcome_recorded_at: "2024-01-01T12:10:00.000Z",
    outcome_code: "reached_scheduled",
    reached_customer: true,
    summary: buildAutomatedCallSummary(),
    ai_summary: null,
    transcript: null,
    twilio_call_sid: "CA-ready",
    twilio_status: "completed",
    twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
    twilio_error_message: null,
    twilio_error_code: null,
    twilio_recording_url: null,
    twilio_recording_sid: null,
    twilio_recording_duration_seconds: null,
    twilio_recording_received_at: null,
  };

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
  });

  async function renderPage() {
    supabaseState.responses.calls = {
      data: [baseCall],
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
    return renderToStaticMarkup(element);
  }

  it("does not render the agent tools panel and keeps a single primary CTA", async () => {
    const markup = await renderPage();
    const window = new Window();
    window.document.body.innerHTML = markup;

    expect(window.document.body.textContent ?? "").not.toContain("Agent tools");
    const primaryCtas = window.document.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
  });
});
