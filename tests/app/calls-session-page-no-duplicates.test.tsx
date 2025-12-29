import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
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
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

describe("CallSessionPage no-duplicate surfaces", () => {
  let supabaseState = setupSupabaseMock();
  let container: HTMLDivElement;
  let root: Root | null = null;

  const baseCall = {
    id: "call-ready",
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
    window.sessionStorage.removeItem("calls-session-mode:call-ready");
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
    supabaseState.responses.calls = { data: [baseCall], error: null };
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

    window.sessionStorage.removeItem("calls-session-mode:call-ready");
    if (mode) {
      window.sessionStorage.setItem("calls-session-mode:call-ready", mode);
    }

    if (root) {
      act(() => {
        root.unmount();
      });
      root = createRoot(container);
    }

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-ready" }) });
    await act(async () => {
      root?.render(element);
      await Promise.resolve();
    });
  }

  function countPrimaryCtas() {
    return container.querySelectorAll('[data-cta-role="primary"]').length;
  }

  function countManualNumberCards() {
    return container.querySelectorAll('[data-testid="call-manual-number-card"]').length;
  }

  function countFollowupSurfaces() {
    return container.querySelectorAll("#askbob-after-call").length;
  }

  function countOpenJobLinks() {
    const elements = Array.from(container.querySelectorAll("a, button"));
    return elements.filter((element) =>
      (element.textContent ?? "").trim() === callSessionCopy.secondaryActions.openJob,
    ).length;
  }

  it("keeps a single primary CTA and single job link before a mode is selected", async () => {
    await renderPage();
    expect(countPrimaryCtas()).toBe(1);
    expect(countOpenJobLinks()).toBe(1);
    expect(countManualNumberCards()).toBe(0);
  });

  it("renders manual tools once and keeps follow-up only in wrap-up", async () => {
    await renderPage("manual");
    expect(countPrimaryCtas()).toBe(1);
    expect(countOpenJobLinks()).toBe(1);
    expect(countManualNumberCards()).toBe(1);
    expect(countFollowupSurfaces()).toBe(1);
  });

  it("hides manual tools and preserves single CTA in automated mode", async () => {
    await renderPage("automated");
    expect(countPrimaryCtas()).toBe(1);
    expect(countOpenJobLinks()).toBe(1);
    expect(countManualNumberCards()).toBe(1);
  });
});
