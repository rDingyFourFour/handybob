type PriorityLevel = "high" | "medium" | "normal" | "low";
type UrgencyLevel = "emergency" | "urgent" | "soon" | "flexible";

export type AttentionSignals = {
  category: string;
  urgency: UrgencyLevel;
  priority: PriorityLevel;
  attentionScore: number;
  reason: string;
  needsFollowup: boolean;
};

const CATEGORY_KEYWORDS: { category: string; patterns: RegExp[] }[] = [
  { category: "plumbing", patterns: [/leak/, /pipe/, /sink/, /drain/, /water heater/] },
  { category: "electrical", patterns: [/outlet/, /breaker/, /power/, /electrical/, /light switch/] },
  { category: "hvac", patterns: [/ac\b/, /a\/c/, /air conditioning/, /furnace/, /heater/, /thermostat/] },
  { category: "roofing", patterns: [/roof/, /shingle/, /attic/, /gutter/] },
  { category: "carpentry", patterns: [/door/, /window/, /trim/, /cabinet/, /framing/] },
  { category: "painting", patterns: [/paint/, /painting/, /stain/] },
  { category: "landscaping", patterns: [/yard/, /lawn/, /tree/, /landscap/] },
];

const EMERGENCY_KEYWORDS = [/flood/, /burst/, /gas/, /smoke/, /sparking/, /fire/, /carbon monoxide/];
const URGENT_KEYWORDS = [/urgent/, /asap/, /today/, /tonight/, /sooner/, /immediately/];
const SOON_KEYWORDS = [/tomorrow/, /this week/, /next week/, /schedule/, /soon/];

export function inferAttentionSignals({
  text,
  summary,
  direction,
  status,
  hasJob,
}: {
  text?: string | null;
  summary?: string | null;
  direction?: string | null;
  status?: string | null;
  hasJob?: boolean;
}): AttentionSignals {
  const blob = `${summary ?? ""} ${text ?? ""}`.toLowerCase();
  let category = "general";
  let urgency: UrgencyLevel = "flexible";
  let score = 0;
  const reasons: string[] = [];

  for (const entry of CATEGORY_KEYWORDS) {
    const match = entry.patterns.some((pat) => pat.test(blob));
    if (match) {
      category = entry.category;
      reasons.push(`Looks like ${entry.category}`);
      break;
    }
  }

  if (EMERGENCY_KEYWORDS.some((pat) => pat.test(blob))) {
    urgency = "emergency";
    score += 70;
    reasons.push("Emergency language detected");
  } else if (URGENT_KEYWORDS.some((pat) => pat.test(blob))) {
    urgency = "urgent";
    score += 45;
    reasons.push("Caller asked for ASAP help");
  } else if (SOON_KEYWORDS.some((pat) => pat.test(blob))) {
    urgency = "soon";
    score += 20;
    reasons.push("Timing indicates soon");
  }

  let needsFollowup = Boolean(direction === "inbound" || status === "voicemail" || status === "missed");
  if (!hasJob) {
    needsFollowup = true;
    reasons.push("No job linked yet");
    score += 10;
  }
  if (!blob.trim()) {
    needsFollowup = true;
    reasons.push("No transcript/summary captured");
    score += 10;
  }

  const priority: PriorityLevel =
    score >= 70 ? "high" : score >= 40 ? "medium" : score >= 10 ? "normal" : "low";
  const attentionScore = Math.min(100, score + (needsFollowup ? 10 : 0));
  const reason = reasons.filter(Boolean).join("; ") || "Captured for follow-up";

  return {
    category,
    urgency,
    priority,
    attentionScore,
    reason,
    needsFollowup,
  };
}
