export type SchemaReadinessReason = "missing_columns" | "missing_constraint" | "unsupported";

let hasLoggedCallOutcomeSchemaReadinessSentinel = false;

export function logCallOutcomeSchemaReadinessSentinel(context: {
  workspaceId: string;
  callId: string;
  reason: SchemaReadinessReason;
  error?: unknown;
}) {
  if (hasLoggedCallOutcomeSchemaReadinessSentinel) {
    return;
  }
  hasLoggedCallOutcomeSchemaReadinessSentinel = true;
  const errorObject = context.error as { code?: unknown; message?: unknown } | undefined;
  console.error("[calls-outcome-schema-not-applied]", {
    workspaceId: context.workspaceId,
    callId: context.callId,
    schemaApplied: false,
    reason: context.reason,
    errorCode: typeof errorObject?.code === "string" ? errorObject?.code : null,
    errorMessage: typeof errorObject?.message === "string" ? errorObject?.message : null,
  });
}

export function resetCallOutcomeSchemaReadinessSentinelForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    return;
  }
  hasLoggedCallOutcomeSchemaReadinessSentinel = false;
}
