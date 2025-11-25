const AI_URGENCY_ORDER = ["emergency", "urgent", "this_week", "soon", "flexible"];

export function aiUrgencyRank(value?: string | null) {
  const idx = AI_URGENCY_ORDER.indexOf((value ?? "").toLowerCase());
  return idx === -1 ? AI_URGENCY_ORDER.length : idx;
}

export { AI_URGENCY_ORDER };
