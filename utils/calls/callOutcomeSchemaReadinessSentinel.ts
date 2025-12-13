export type SchemaReadinessReason = "missing_columns" | "missing_constraint" | "unsupported";

type SchemaNotAppliedLogPayload = {
  workspaceId: string;
  callId: string;
  reason: SchemaReadinessReason;
  cached: boolean;
  error?: unknown;
};

let hasLoggedCallOutcomeSchemaReadinessSentinel = false;

export function maybeLogSchemaNotAppliedOnce(payload: SchemaNotAppliedLogPayload) {
  if (hasLoggedCallOutcomeSchemaReadinessSentinel) {
    return;
  }
  hasLoggedCallOutcomeSchemaReadinessSentinel = true;
  const errorObject = payload.error as { code?: unknown; message?: unknown } | undefined;
  console.error("[calls-outcome-schema-not-applied]", {
    workspaceId: payload.workspaceId,
    callId: payload.callId,
    schemaApplied: false,
    reason: payload.reason,
    cached: payload.cached,
    errorCode: typeof errorObject?.code === "string" ? errorObject?.code : null,
    errorMessage: typeof errorObject?.message === "string" ? errorObject?.message : null,
  });
}

export function resetSchemaNotAppliedSentinelForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    return;
  }
  hasLoggedCallOutcomeSchemaReadinessSentinel = false;
}
