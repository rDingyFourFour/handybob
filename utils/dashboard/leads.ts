const LEAD_SOURCE_LABELS: Record<string, string> = {
  web_form: "Web form",
  voicemail: "Call",
  manual: "Manual",
};

export function formatLeadSourceLabel(source?: string | null) {
  if (!source) return "Other";
  const key = source.toLowerCase();
  return LEAD_SOURCE_LABELS[key] ?? "Other";
}
