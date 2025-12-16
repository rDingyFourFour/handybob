const TWILIO_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  initiated: "Call initiated",
  ringing: "Ringing",
  "in-progress": "In progress",
  completed: "Completed",
  busy: "Line busy",
  "no-answer": "No answer",
  failed: "Failed",
  canceled: "Canceled",
  answered: "Connected",
};

export function formatTwilioStatusLabel(status?: string | null) {
  if (!status) {
    return null;
  }
  const normalized = status.toLowerCase();
  return TWILIO_STATUS_LABELS[normalized] ?? normalized.replace(/-/g, " ");
}
