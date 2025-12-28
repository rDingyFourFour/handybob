import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import CallWorkspaceCard from "@/app/(app)/calls/[id]/CallWorkspaceCard";
import CallManualNumberCard from "@/app/(app)/calls/[id]/CallManualNumberCard";
import CallSessionPage from "@/app/(app)/calls/[id]/page";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

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

    const workspaceCards = window.document.querySelectorAll(
      '[data-testid="call-workspace-card"]',
    );
    const guidedWorkspaceCards = window.document.querySelectorAll(
      '[data-testid="guided-call-workspace"]',
    );
    expect(workspaceCards).toHaveLength(1);
    expect(guidedWorkspaceCards).toHaveLength(0);
  });

  it("renders manual tools only when manual mode is active", () => {
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

    const manualMarkup = renderToStaticMarkup(
      <CallWorkspaceCard
        callId="call-1"
        workspaceId="workspace-1"
        jobId="job-1"
        customerId="customer-1"
        selectedMode="manual"
        automatedEligible
        manualEligible
        automatedPanel={automatedPanel}
        manualPanel={manualPanel}
      />,
    );
    expect(manualMarkup).toContain("Copy number");
    expect(manualMarkup).not.toContain("Automated-only tools");

    const automatedMarkup = renderToStaticMarkup(
      <CallWorkspaceCard
        callId="call-1"
        workspaceId="workspace-1"
        jobId="job-1"
        customerId="customer-1"
        selectedMode="automated"
        automatedEligible
        manualEligible
        automatedPanel={automatedPanel}
        manualPanel={manualPanel}
      />,
    );
    expect(automatedMarkup).not.toContain("Copy number");
    expect(automatedMarkup).toContain("Automated-only tools");
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

    const followupCards = window.document.querySelectorAll("#askbob-after-call");
    const wrapUpCard = window.document.querySelector('[data-testid="call-wrap-up-card"]');
    const callControlCard = window.document.querySelector('[data-testid="call-control-card"]');
    expect(followupCards).toHaveLength(1);
    expect(wrapUpCard?.querySelector("#askbob-after-call")).toBeTruthy();
    expect(callControlCard?.querySelector("#askbob-after-call")).toBeFalsy();
  });
});
