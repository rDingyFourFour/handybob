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

import { saveCallOutcomeAction } from "@/app/(app)/calls/actions/saveCallOutcome";

describe("saveCallOutcomeAction", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
  });

  it("persists normalized values for a valid request", async () => {
    const callRow = { id: "call-1", workspace_id: "workspace-1" };
    supabaseState.responses.calls = { data: [callRow], error: null };

    const formData = new FormData();
    formData.append("callId", "call-1");
    formData.append("workspaceId", "workspace-1");
    formData.append("reachedCustomer", "true");
    formData.append("outcomeCode", "reached_needs_followup");
    formData.append("notes", "  Followed up with the customer\nleft details in notes.  ");

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.callId).toBe("call-1");
    expect(result.reachedCustomer).toBe(true);
    expect(result.outcomeCode).toBe("reached_needs_followup");
    expect(result.notes).toBe("Followed up with the customer left details in notes.");
    expect(result.recordedAtIso).toBeTruthy();

    const updatePayload = supabaseState.queries.calls.update.mock.calls[0]?.[0];
    expect(updatePayload).toEqual(
      expect.objectContaining({
        reached_customer: true,
        outcome_code: "reached_needs_followup",
        outcome_notes: "Followed up with the customer left details in notes.",
        outcome_recorded_by: "user-1",
        outcome: "reached",
      }),
    );
  });

  it("returns wrong_workspace when the call belongs to another workspace", async () => {
    const callRow = { id: "call-2", workspace_id: "workspace-2" };
    supabaseState.responses.calls = { data: [callRow], error: null };

    const formData = new FormData();
    formData.append("callId", "call-2");
    formData.append("workspaceId", "workspace-1");

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(false);
    expect(result).toEqual({
      ok: false,
      error: "Wrong workspace",
      code: "wrong_workspace",
    });
  });

  it("returns call_not_found when the call is missing", async () => {
    supabaseState.responses.calls = { data: [], error: null };

    const formData = new FormData();
    formData.append("callId", "missing-call");
    formData.append("workspaceId", "workspace-1");

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(false);
    expect(result).toEqual({
      ok: false,
      error: "Call not found",
      code: "call_not_found",
    });
  });
});
