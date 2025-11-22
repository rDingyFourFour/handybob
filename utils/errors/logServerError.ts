export type LogContext = {
  entityType?: string;
  entityId?: string;
  workspaceId?: string;
  message?: string;
};

/**
 * Logs server errors with structured context to make post-mortems easier while keeping handlers free of verbosity.
 * Use this in server components/actions/webhooks before returning a user-friendly response.
 */
export function logServerError(context: LogContext, error: unknown) {
  const { entityType = "server", entityId, workspaceId, message = "Unexpected error" } = context;
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(
    `[${entityType}] ${message}`,
    {
      entityType,
      entityId,
      workspaceId,
      error: errorMessage,
    }
  );
}
