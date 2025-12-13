import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { CALL_OUTCOME_CODE_VALUES } from "@/lib/domain/communications/callOutcomes";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockRevalidatePath = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import {
  CALL_OUTCOME_DB_CONSTRAINT_MISMATCH_MESSAGE,
  CALL_OUTCOME_SCHEMA_OUT_OF_DATE_MESSAGE,
} from "@/utils/calls/callOutcomeMessages";
import {
  resetCallOutcomeSchemaStateForTests,
  saveCallOutcomeAction,
} from "@/app/(app)/calls/actions/saveCallOutcome";
import { resetCallOutcomeSchemaMismatchSentinelForTests } from "@/utils/calls/callOutcomeSchemaMismatchSentinel";
import { resetSchemaNotAppliedSentinelForTests } from "@/utils/calls/callOutcomeSchemaReadinessSentinel";

describe("saveCallOutcomeAction", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(async () => {
    resetCallOutcomeSchemaMismatchSentinelForTests();
    resetSchemaNotAppliedSentinelForTests();
    await resetCallOutcomeSchemaStateForTests();
    supabaseState = setupSupabaseMock();
    supabaseState.rpcResponses["get_call_outcome_schema_readiness"] = {
      data: [{ columns_present: true, constraint_present: true }],
      error: null,
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    mockRevalidatePath.mockReset();
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

  it.each(CALL_OUTCOME_CODE_VALUES)("persists outcome code %s", async (outcomeCode) => {
    const callRow = { id: `call-${outcomeCode}`, workspace_id: "workspace-1" };
    supabaseState.responses.calls = { data: [callRow], error: null };

    const formData = new FormData();
    formData.append("callId", callRow.id);
    formData.append("workspaceId", "workspace-1");
    formData.append("outcomeCode", outcomeCode);

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(true);
    const updatePayload = supabaseState.queries.calls.update.mock.calls[0]?.[0];
    expect(updatePayload?.outcome_code).toBe(outcomeCode);
  });

  it("treats an empty outcome code as null", async () => {
    const callRow = { id: "call-3", workspace_id: "workspace-1" };
    supabaseState.responses.calls = { data: [callRow], error: null };

    const formData = new FormData();
    formData.append("callId", "call-3");
    formData.append("workspaceId", "workspace-1");
    formData.append("outcomeCode", ""); // empty string should clear the field

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(true);
    const updatePayload = supabaseState.queries.calls.update.mock.calls[0]?.[0];
    expect(updatePayload?.outcome_code).toBe(null);
  });

  it("treats a missing outcome code field as null", async () => {
    const callRow = { id: "call-missing-outcome", workspace_id: "workspace-1" };
    supabaseState.responses.calls = { data: [callRow], error: null };

    const formData = new FormData();
    formData.append("callId", "call-missing-outcome");
    formData.append("workspaceId", "workspace-1");

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(true);
    const updatePayload = supabaseState.queries.calls.update.mock.calls[0]?.[0];
    expect(updatePayload?.outcome_code).toBe(null);
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

  it("returns invalid_outcome_code for disallowed values without touching the DB", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const formData = new FormData();
    formData.append("callId", "call-4");
    formData.append("workspaceId", "workspace-1");
    formData.append("outcomeCode", "invalid_choice");

    const result = await saveCallOutcomeAction(formData);

    expect(result).toEqual({
      ok: false,
      error: "Invalid outcome code",
      code: "invalid_outcome_code",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[calls-outcome-invalid-code]",
      expect.objectContaining({
        outcomeCodeRaw: "invalid_choice",
        wasEmptyString: false,
      }),
    );
    expect(supabaseState.queries.calls).toBeUndefined();

    warnSpy.mockRestore();
  });

  it("returns schema_not_applied when the schema readiness check fails", async () => {
    const callRow = { id: "call-schema-not-applied", workspace_id: "workspace-1" };
    supabaseState.responses.calls = { data: [callRow], error: null };
    supabaseState.rpcResponses["get_call_outcome_schema_readiness"] = {
      data: [{ columns_present: false, constraint_present: false }],
      error: null,
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const formData = new FormData();
    formData.append("callId", "call-schema-not-applied");
    formData.append("workspaceId", "workspace-1");
    formData.append("outcomeCode", "reached_needs_followup");

    const result = await saveCallOutcomeAction(formData);

    expect(result).toEqual({
      ok: false,
      error: CALL_OUTCOME_SCHEMA_OUT_OF_DATE_MESSAGE,
      code: "schema_not_applied",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[calls-outcome-schema-not-applied]",
      expect.objectContaining({
        schemaApplied: false,
        reason: "missing_columns",
        cached: false,
      }),
    );
    expect(supabaseState.queries.calls.update).not.toHaveBeenCalled();

    supabaseState.responses.calls = { data: [callRow], error: null };
    await saveCallOutcomeAction(formData);

    const sentinelCalls = errorSpy.mock.calls.filter(
      (call) => call[0] === "[calls-outcome-schema-not-applied]",
    );
    expect(sentinelCalls).toHaveLength(1);

    errorSpy.mockRestore();
  });

  it("returns db_constraint_rejects_value when Postgres rejects an allowed outcome code", async () => {
    const callRow = { id: "call-with-constraint", workspace_id: "workspace-1" };
    supabaseState.responses.calls = [
      { data: [callRow], error: null },
      {
        data: null,
        error: { code: "23514", message: "calls_outcome_code_check violation" },
      },
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const formData = new FormData();
    formData.append("callId", "call-with-constraint");
    formData.append("workspaceId", "workspace-1");
    formData.append("outcomeCode", "reached_needs_followup");

    const result = await saveCallOutcomeAction(formData);

    expect(result).toEqual({
      ok: false,
      error: CALL_OUTCOME_DB_CONSTRAINT_MISMATCH_MESSAGE,
      code: "db_constraint_rejects_value",
    });
    const dbViolationCalls = errorSpy.mock.calls.filter(
      (call) => call[0] === "[calls-outcome-db-constraint-violation]",
    );
    expect(dbViolationCalls).toHaveLength(1);
    const schemaMismatchCalls = errorSpy.mock.calls.filter(
      (call) => call[0] === "[calls-outcome-schema-mismatch]",
    );
    expect(schemaMismatchCalls).toHaveLength(1);

    errorSpy.mockRestore();
  });

  it("emits the schema mismatch sentinel only once across repeated violations", async () => {
    const callRow = { id: "call-repeated", workspace_id: "workspace-1" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const buildResponses = () => [
      { data: [callRow], error: null },
      {
        data: null,
        error: { code: "23514", message: "calls_outcome_code_check violation" },
      },
    ];
    const formDataFactory = () => {
      const formData = new FormData();
      formData.append("callId", "call-repeated");
      formData.append("workspaceId", "workspace-1");
      formData.append("outcomeCode", "reached_needs_followup");
      return formData;
    };

    await (async () => {
      supabaseState.responses.calls = buildResponses();
      expect(await saveCallOutcomeAction(formDataFactory())).toEqual({
        ok: false,
        error: CALL_OUTCOME_DB_CONSTRAINT_MISMATCH_MESSAGE,
        code: "db_constraint_rejects_value",
      });
    })();
    await (async () => {
      supabaseState.responses.calls = buildResponses();
      expect(await saveCallOutcomeAction(formDataFactory())).toEqual({
        ok: false,
        error: CALL_OUTCOME_DB_CONSTRAINT_MISMATCH_MESSAGE,
        code: "db_constraint_rejects_value",
      });
    })();

    const sentinelCalls = errorSpy.mock.calls.filter(
      (call) => call[0] === "[calls-outcome-schema-mismatch]",
    );
    expect(sentinelCalls).toHaveLength(1);
    const dbViolationCalls = errorSpy.mock.calls.filter(
      (call) => call[0] === "[calls-outcome-db-constraint-violation]",
    );
    expect(dbViolationCalls).toHaveLength(2);

    errorSpy.mockRestore();
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

  it("revalidates the job route when jobId is supplied", async () => {
    const callRow = { id: "call-1", workspace_id: "workspace-1" };
    supabaseState.responses.calls = { data: [callRow], error: null };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const formData = new FormData();
    formData.append("callId", "call-1");
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");
    formData.append("reachedCustomer", "true");
    formData.append("outcomeCode", "reached_scheduled");

    const result = await saveCallOutcomeAction(formData);

    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
    expect(mockRevalidatePath).toHaveBeenNthCalledWith(1, "/calls/call-1");
    expect(mockRevalidatePath).toHaveBeenNthCalledWith(2, "/jobs/job-1");
    expect(logSpy).toHaveBeenCalledWith(
      "[calls-outcome-ui-success]",
      expect.objectContaining({
        workspaceId: "workspace-1",
        callId: "call-1",
        hasJobId: true,
      }),
    );

    logSpy.mockRestore();
  });

  it("returns invalid_form_data when invoked without FormData", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await saveCallOutcomeAction(null);

    expect(result).toEqual({
      ok: false,
      error: "Invalid form data",
      code: "invalid_form_data",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[calls-save-outcome-invalid-formdata]",
      expect.objectContaining({ hint: "null" }),
    );

    warnSpy.mockRestore();
  });
});
