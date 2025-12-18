import { describe, expect, it, beforeEach, vi } from "vitest";

import { saveAutomatedCallNotesAction } from "@/app/(app)/calls/actions/saveAutomatedCallNotesAction";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { updateCallSessionAutomatedNotes } from "@/lib/domain/calls/sessions";

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: vi.fn(),
}));
vi.mock("@/lib/domain/calls/sessions", () => ({
  updateCallSessionAutomatedNotes: vi.fn(),
}));

const mockCreateServerClient = createServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetCurrentWorkspace = getCurrentWorkspace as unknown as ReturnType<typeof vi.fn>;
const mockUpdateCallSessionAutomatedNotes = updateCallSessionAutomatedNotes as unknown as ReturnType<typeof vi.fn>;

let supabaseClient: Record<string, unknown>;

beforeEach(() => {
  supabaseClient = {};
  mockCreateServerClient.mockResolvedValue(supabaseClient);
  mockGetCurrentWorkspace.mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  });
  mockUpdateCallSessionAutomatedNotes.mockReset();
});

describe("saveAutomatedCallNotesAction", () => {
  it("returns invalid_payload when payload is malformed", async () => {
    const response = await saveAutomatedCallNotesAction({
      workspaceId: "",
      callId: "call-1",
      notes: "Note",
    });
    expect(response.ok).toBe(false);
    expect(response.code).toBe("invalid_payload");
    expect(mockUpdateCallSessionAutomatedNotes).not.toHaveBeenCalled();
  });

  it("returns wrong_workspace when the workspace context does not match", async () => {
    mockGetCurrentWorkspace.mockResolvedValueOnce({
      user: { id: "user-1" },
      workspace: { id: "workspace-2" },
    });
    const response = await saveAutomatedCallNotesAction({
      workspaceId: "workspace-1",
      callId: "call-1",
      notes: "Note",
    });
    expect(response.ok).toBe(false);
    expect(response.code).toBe("wrong_workspace");
    expect(mockUpdateCallSessionAutomatedNotes).not.toHaveBeenCalled();
  });

  it("returns call_not_found when the helper throws a not found error", async () => {
    mockUpdateCallSessionAutomatedNotes.mockRejectedValueOnce(new Error("Call not found"));
    const response = await saveAutomatedCallNotesAction({
      workspaceId: "workspace-1",
      callId: "call-1",
      notes: "Note",
    });
    expect(response.ok).toBe(false);
    expect(response.code).toBe("call_not_found");
  });

  it("persists sanitized notes when the payload is valid", async () => {
    mockUpdateCallSessionAutomatedNotes.mockResolvedValue("sanitized");
    const response = await saveAutomatedCallNotesAction({
      workspaceId: "workspace-1",
      callId: "call-1",
      notes: "  raw note ",
    });
    expect(response.ok).toBe(true);
    expect(response.callId).toBe("call-1");
    expect(response.notes).toBe("sanitized");
    expect(mockUpdateCallSessionAutomatedNotes).toHaveBeenCalledWith({
      supabase: supabaseClient,
      workspaceId: "workspace-1",
      callId: "call-1",
      notes: "  raw note ",
    });
  });
});
