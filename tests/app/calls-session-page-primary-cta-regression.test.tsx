import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { SPEECH_PLAN_METADATA_MARKER } from "@/lib/domain/askbob/speechPlan";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";

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
  let logSpy: ReturnType<typeof vi.spyOn>;

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
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
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
    const workspaceRoots = container.querySelectorAll("#call-workspace");
    expect(workspaceRoots).toHaveLength(1);
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
  });

  it("switches the primary CTA between automated and manual modes", async () => {
    await renderWithCall({}, [], "automated");
    assertSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.startAutomated);

    await renderWithCall({}, [], "manual");
    assertSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.startGuided);
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
    assertSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.captureOutcome);

    await renderWithCall(
      {
        twilio_call_sid: "CA-terminal",
        twilio_status: "completed",
        twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
      },
      [],
      "manual",
    );
    assertSinglePrimaryCta(callSessionInstructionCopy.primaryCta.label.captureOutcome);
  });

  it("shows an instruction explanation when a mode is unselected", async () => {
    await renderWithCall({}, [], undefined);
    const explanation = container.querySelector('[data-testid="call-session-primary-cta-explanation"] p');
    expect(explanation?.textContent?.trim()).toBe(
      callSessionInstructionCopy.primaryCta.explanation.select_call_mode,
    );
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
  });

  it("bubbles instruction telemetry when the CTA is clicked", async () => {
    await renderWithCall({}, [], "manual");
    const primaryCta = container.querySelector('[data-testid="call-session-primary-cta"]');
    expect(primaryCta).toBeTruthy();
    act(() => {
      primaryCta?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const clickEvent = logSpy.mock.calls.find((args) => args[0] === "[calls-session-primary-cta-click]");
    expect(clickEvent).toBeTruthy();
    const payload = clickEvent?.[1] as Record<string, unknown>;
    expect(payload?.reasonCode).toBe("start_guided_call");
    expect(payload?.primaryCtaLabel).toBe(callSessionInstructionCopy.primaryCta.label.startGuided);
  });
});
