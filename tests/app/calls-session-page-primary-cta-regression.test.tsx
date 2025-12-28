import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { SPEECH_PLAN_METADATA_MARKER } from "@/lib/domain/askbob/speechPlan";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

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
    push: vi.fn(),
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
  let container: HTMLDivElement;
  let root: Root | null = null;

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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  function resetModeStorage() {
    window.sessionStorage.removeItem("calls-session-mode:call-1");
  }

  async function renderWithCall(
    callOverrides: Partial<typeof baseCall>,
    snapshots: Array<Record<string, unknown>> = [],
    mode?: "automated" | "manual",
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

    resetModeStorage();
    if (mode) {
      window.sessionStorage.setItem("calls-session-mode:call-1", mode);
    }

    if (root) {
      act(() => {
        root.unmount();
      });
      root = createRoot(container);
    }

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-1" }) });
    await act(async () => {
      root?.render(element);
      await Promise.resolve();
    });
  }

  function assertSinglePrimaryCta(expectedLabel: string) {
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    const primaryCta = primaryCtas[0] as HTMLElement | undefined;
    expect(primaryCta?.textContent ?? "").toContain(expectedLabel);
  }

  it("renders a single workspace root and primary CTA", async () => {
    await renderWithCall({});
    const workspaceRoots = container.querySelectorAll('[data-testid="call-workspace-card"]');
    const guidedRoots = container.querySelectorAll('[data-testid="guided-call-workspace"]');
    expect(workspaceRoots).toHaveLength(1);
    expect(guidedRoots).toHaveLength(0);
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
  });

  it("switches the primary CTA between automated and manual modes", async () => {
    await renderWithCall({}, [], "automated");
    assertSinglePrimaryCta(callSessionCopy.primaryCta.label.startAutomated);

    await renderWithCall({}, [], "manual");
    assertSinglePrimaryCta(callSessionCopy.primaryCta.label.startGuided);
  });

  it("updates the primary CTA by readiness state without creating duplicate primaries", async () => {
    await renderWithCall(
      {
        twilio_call_sid: "CA-terminal",
        twilio_status: "completed",
        twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
      },
      [],
      "automated",
    );
    assertSinglePrimaryCta(callSessionCopy.primaryCta.label.captureOutcome);

    await renderWithCall(
      {
        twilio_call_sid: "CA-terminal",
        twilio_status: "completed",
        twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
      },
      [],
      "manual",
    );
    assertSinglePrimaryCta(callSessionCopy.primaryCta.label.captureOutcome);
  });
});
