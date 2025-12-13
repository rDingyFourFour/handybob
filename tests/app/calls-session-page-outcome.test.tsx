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

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
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
    expect(markup).toContain("Outcome not recorded yet.");
    expect(markup).toContain("Record outcome");
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
          summary: "AskBob call script: test",
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
});
