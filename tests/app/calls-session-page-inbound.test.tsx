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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
  }),
}));

import CallSessionPage from "@/app/(app)/calls/[id]/page";

describe("CallSessionPage inbound flow", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
  });

  it("renders the inbound strip and hides outbound actions", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          created_at: "2023-01-01T12:00:00.000Z",
          job_id: null,
          customer_id: null,
          direction: "inbound",
          from_number: "+15550001111",
          to_number: "+15550002222",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          ai_summary: null,
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = { data: [], error: null };
    supabaseState.responses.jobs = { data: [], error: null };
    supabaseState.responses.quotes = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-1" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Inbound");
    expect(markup).toContain("From: +15550001111");
    expect(markup).toContain("To: +15550002222");
    expect(markup).toContain("Created");
    expect(markup).not.toContain("Send follow-up SMS");
  });

  it("shows the linked context card when the call has a customer and job", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-2",
          workspace_id: "workspace-1",
          created_at: "2023-01-02T12:00:00.000Z",
          job_id: "job-1",
          customer_id: "customer-1",
          direction: "inbound",
          from_number: "+15550003333",
          to_number: "+15550004444",
          outcome: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          outcome_code: null,
          reached_customer: null,
          summary: null,
          ai_summary: null,
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = {
      data: [
        {
          id: "customer-1",
          name: "Jane Doe",
          phone: "+15550003333",
        },
      ],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        {
          id: "job-1",
          title: "Roof repair",
          customer_id: "customer-1",
        },
      ],
      error: null,
    };
    supabaseState.responses.quotes = { data: [], error: null };

    const element = await CallSessionPage({ params: Promise.resolve({ id: "call-2" }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Link call context");
    expect(markup).toContain("Coaching for Roof repair");
  });
});
