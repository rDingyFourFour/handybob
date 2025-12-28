import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

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
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

describe("CallSessionPage UX copy", () => {
  let supabaseState = setupSupabaseMock();
  let container: HTMLDivElement;
  let root: Root | null = null;

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
    window.sessionStorage.removeItem("calls-session-mode:call-1");
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

  async function renderPage(mode?: "automated" | "manual") {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          created_at: "2024-01-01T12:00:00.000Z",
          job_id: "job-1",
          customer_id: "customer-1",
          direction: "outbound",
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: "Reached and scheduled.",
          outcome_recorded_at: "2024-01-01T12:10:00.000Z",
          outcome_code: "reached_scheduled",
          reached_customer: true,
          summary: "Call summary",
          ai_summary: null,
          transcript: null,
          twilio_call_sid: "CA-terminal",
          twilio_status: "completed",
          twilio_status_updated_at: "2024-01-01T12:05:00.000Z",
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
          title: "Ready job",
          status: "open",
          customer_id: "customer-1",
          customers: [{ id: "customer-1", name: "Ready Customer", phone: "+15550002222" }],
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };
    supabaseState.responses.messages = { data: [], error: null };
    supabaseState.responses.askbob_job_task_snapshots = { data: [], error: null };

    if (mode) {
      window.sessionStorage.setItem("calls-session-mode:call-1", mode);
    } else {
      window.sessionStorage.removeItem("calls-session-mode:call-1");
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

  it("renders canonical copy and keeps wrap-up as the only follow-up funnel", async () => {
    await renderPage();

    expect(container.textContent).toContain(callSessionCopy.mode.title);
    expect(container.textContent).toContain(callSessionCopy.mode.automated.label);
    expect(container.textContent).toContain(callSessionCopy.mode.manual.label);

    await renderPage("manual");
    expect(container.textContent).toContain(callSessionCopy.manualTools.title);
    expect(container.textContent).toContain(callSessionCopy.wrapUp.title);

    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    const explanation = container.querySelector('[data-testid="call-session-primary-cta-explanation"]');
    expect(explanation?.textContent?.trim().length ?? 0).toBeGreaterThan(0);

    const wrapUpCard = container.querySelector('[data-testid="call-wrap-up-card"]');
    const totalGenerateButtons = container.textContent
      ? container.textContent.split(callSessionCopy.wrapUp.afterCall.generate).length
      : 0;
    const wrapUpGenerateButtons = wrapUpCard?.textContent
      ? wrapUpCard.textContent.split(callSessionCopy.wrapUp.afterCall.generate).length
      : 0;
    const totalOpenComposer = container.textContent
      ? container.textContent.split(callSessionCopy.wrapUp.afterCall.openComposer).length
      : 0;
    const wrapUpOpenComposer = wrapUpCard?.textContent
      ? wrapUpCard.textContent.split(callSessionCopy.wrapUp.afterCall.openComposer).length
      : 0;

    expect(totalGenerateButtons).toBe(wrapUpGenerateButtons);
    expect(totalOpenComposer).toBe(wrapUpOpenComposer);
  });
});
