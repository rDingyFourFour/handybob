import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import CallSessionPage from "@/app/(app)/calls/[id]/page";
import CallManualNumberCard from "@/app/(app)/calls/[id]/CallManualNumberCard";
import CallWorkspaceHost from "@/app/(app)/calls/[id]/CallWorkspaceHost";
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

describe("Call session workspace modes", () => {
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
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
  });

  it("renders a single workspace surface on the call session page", async () => {
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
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: "AskBob call script: Follow-up notes",
          ai_summary: null,
          transcript: null,
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
    const window = new Window();
    window.document.body.innerHTML = markup;

    const workspaceCards = window.document.querySelectorAll("#call-workspace");
    expect(workspaceCards).toHaveLength(1);
  });

  it("renders manual tools only when manual mode is active", async () => {
    const manualPanel = (
      <CallManualNumberCard
        workspaceId="workspace-1"
        callId="call-1"
        jobId="job-1"
        customerId="customer-1"
        customerPhone="+15550001111"
        scriptSummary="Script summary"
      />
    );
    const automatedPanel = <div>Automated-only tools</div>;

    await act(async () => {
      root?.render(
        <CallWorkspaceHost
          mode="manual"
          workspaceId="workspace-1"
          callId="call-1"
          jobId="job-1"
          customerId="customer-1"
          automatedEligible
          manualEligible
          automatedPanels={[{ id: "automated-tools", node: automatedPanel }]}
          manualPanels={[{ id: "manual-tools", node: manualPanel }]}
          manualFallbackNode={<div>fallback</div>}
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain(callSessionCopy.manualTools.copyPhone);
    expect(container.textContent).not.toContain("Automated-only tools");

    await act(async () => {
      root?.unmount();
      root = createRoot(container);
      root.render(
        <CallWorkspaceHost
          mode="automated"
          workspaceId="workspace-1"
          callId="call-1"
          jobId="job-1"
          customerId="customer-1"
          automatedEligible
          manualEligible
          automatedPanels={[{ id: "automated-tools", node: automatedPanel }]}
          manualPanels={[{ id: "manual-tools", node: manualPanel }]}
          manualFallbackNode={<div>fallback</div>}
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain(callSessionCopy.manualTools.copyPhone);
    expect(container.textContent).toContain("Automated-only tools");
  });

  it("renders follow-up controls only inside the wrap-up card", async () => {
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
    const window = new Window();
    window.document.body.innerHTML = markup;

    const wrapUpCard = window.document.querySelector('[data-testid="call-wrap-up-card"]');
    const wrapUpFollowups = wrapUpCard?.querySelectorAll("#askbob-after-call") ?? [];
    expect(wrapUpFollowups).toHaveLength(1);
    const allFollowups = window.document.querySelectorAll("#askbob-after-call");
    expect(allFollowups).toHaveLength(wrapUpFollowups.length);
  });
});
