import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { SPEECH_PLAN_METADATA_MARKER } from "@/lib/domain/askbob/speechPlan";
import { mapCtaReasonCodeToExplanation } from "@/lib/domain/calls/sessions";

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

describe("CallSessionPage primary CTA regression", () => {
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
    outcome_notes: null,
    outcome_recorded_at: null,
    outcome_code: null,
    reached_customer: null,
    summary: buildAutomatedCallSummary(),
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

  async function renderWithCall(
    callOverrides: Partial<typeof baseCall>,
    snapshots: Array<Record<string, unknown>> = [],
  ) {
    supabaseState.responses.calls = {
      data: [{ ...baseCall, ...callOverrides }],
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
    supabaseState.responses.askbob_job_task_snapshots = { data: snapshots, error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-1" }) });
    return renderToStaticMarkup(element);
  }

  function expectSinglePrimaryCta(
    markup: string,
    label: string,
    expectedDisabled: boolean,
    expectedExplanation: string,
  ) {
    const window = new Window();
    window.document.body.innerHTML = markup;
    const primaryCtas = window.document.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    const primaryCta = primaryCtas[0] as HTMLElement | undefined;
    const primaryLabel = primaryCta?.textContent ?? "";
    expect(primaryLabel).toContain(label);
    expect(primaryCta?.hasAttribute("disabled") ?? false).toBe(expectedDisabled);
    const explanationNode = window.document.querySelector(
      '[data-testid="call-session-primary-cta-explanation"]',
    );
    const explanationText = explanationNode?.textContent ?? "";
    const normalizedExplanation = explanationText.replace(/&#x27;/g, "'");
    expect(normalizedExplanation).toContain(expectedExplanation);
    const workspace = window.document.querySelector('[data-testid="guided-call-workspace"]');
    const workspaceCtas = workspace?.querySelectorAll('[data-cta-role="primary"]') ?? [];
    expect(workspaceCtas).toHaveLength(0);
  }

  it("shows Start automated call when dial has not been requested", async () => {
    const markup = await renderWithCall({});
    expectSinglePrimaryCta(
      markup,
      "Open automated call panel",
      false,
      mapCtaReasonCodeToExplanation("start_automated_call", "start-automated-call"),
    );
  });

  it("shows Refresh status while dialing is in progress", async () => {
    const markup = await renderWithCall({
      twilio_call_sid: "CA-in-progress",
      twilio_status: "ringing",
      twilio_status_updated_at: "2024-01-01T12:01:00.000Z",
    });
    expectSinglePrimaryCta(
      markup,
      "Refresh status",
      false,
      mapCtaReasonCodeToExplanation("not_terminal", "refresh-status"),
    );
  });

  it("shows Capture outcome after terminal call without outcome", async () => {
    const markup = await renderWithCall({
      twilio_call_sid: "CA-terminal",
      twilio_status: "completed",
      twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
    });
    expectSinglePrimaryCta(
      markup,
      "Capture outcome",
      false,
      mapCtaReasonCodeToExplanation("missing_outcome", "capture-outcome"),
    );
  });

  it("shows Generate follow-up after outcome saved without draft", async () => {
    const markup = await renderWithCall({
      twilio_call_sid: "CA-done",
      twilio_status: "completed",
      twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
      outcome_code: "reached_scheduled",
      outcome_notes: "Reached and scheduled",
      outcome_recorded_at: "2024-01-01T12:10:00.000Z",
      reached_customer: true,
    });
    expectSinglePrimaryCta(
      markup,
      "Generate follow-up",
      false,
      mapCtaReasonCodeToExplanation("ready", "generate-followup"),
    );
  });

  it("shows Open composer when a draft is present", async () => {
    const markup = await renderWithCall(
      {
        twilio_call_sid: "CA-draft",
        twilio_status: "completed",
        twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
        outcome_code: "reached_scheduled",
        outcome_notes: "Reached and scheduled",
        outcome_recorded_at: "2024-01-01T12:10:00.000Z",
        reached_customer: true,
      },
      [
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
          updated_at: "2024-01-01T12:15:00.000Z",
        },
      ],
    );
    expectSinglePrimaryCta(
      markup,
      "Open composer",
      false,
      mapCtaReasonCodeToExplanation("draft_ready", "open-composer"),
    );
  });
});
