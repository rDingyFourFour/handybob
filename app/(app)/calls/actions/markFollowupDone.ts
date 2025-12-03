export async function markFollowupDoneAction(formData: FormData) {
  "use server";
  const callId = formData.get("callId")?.toString();
  const jobId = formData.get("jobId")?.toString() || null;
  const quoteId = formData.get("quoteId")?.toString() || null;
  const workspaceId = formData.get("workspaceId")?.toString();

  if (!callId || !workspaceId) {
    console.warn("[calls] Missing call/workspace for markFollowupDoneAction");
    return null;
  }

  console.log("[calls] mark follow-up done requested", {
    callId,
    jobId,
    quoteId,
    workspaceId,
  });

  // TODO: once the calls table exposes an explicit follow-up state field,
  // update that column here instead of only logging. Right now we simply log the intent.
  return null;
}
