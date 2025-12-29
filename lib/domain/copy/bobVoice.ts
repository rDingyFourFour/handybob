const forbiddenBobPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "regenerate", pattern: /\bregenerate\b/i },
  { label: "pipeline", pattern: /\bpipeline\b/i },
  { label: "workflow", pattern: /\bworkflow\b/i },
  { label: "model", pattern: /\bmodel\b/i },
  { label: "inference", pattern: /\binference\b/i },
  { label: "AI-powered", pattern: /AI-powered/i },
  { label: "AI powered", pattern: /AI powered/i },
  { label: "chatbot", pattern: /\bchatbot\b/i },
  { label: "SaaS", pattern: /\bSaaS\b/i },
  { label: "optimize", pattern: /\boptimize\b/i },
  { label: "configure", pattern: /\bconfigure\b/i },
  { label: "execute", pattern: /\bexecute\b/i },
];

const bobStatusMap: Array<[string, string]> = [
  ["not ready", "Waiting on diagnosis"],
  ["waiting on diagnosis", "Waiting on diagnosis"],
  ["diagnosis pending", "Waiting on diagnosis"],
  ["follow-up pending", "Waiting for response"],
  ["followup pending", "Waiting for response"],
  ["waiting for response", "Waiting for response"],
  ["materials ready", "Draft ready"],
  ["draft ready", "Draft ready"],
  ["drafted", "Draft ready"],
  ["ready", "Draft ready"],
  ["completed", "Completed"],
  ["done", "Completed"],
  ["pending", "Not yet"],
];

const primaryVerbReplacements: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bRegenerate\b/i, replacement: "Update" },
  { pattern: /\bGenerate\b/i, replacement: "Review" },
  { pattern: /\bExecute\b/i, replacement: "Start" },
  { pattern: /\bConfigure\b/i, replacement: "Update" },
];

const openEndedQuestionPatterns: RegExp[] = [
  /what would you like/i,
  /how can I help/i,
  /what do you want to do/i,
  /anything else/i,
  /what's next/i,
  /what should we do/i,
  /want me to do/i,
];

const sanitizeForMessage = (value: string) => value.trim().replace(/[!]+/g, ".").replace(/\s+/g, " ");

const isAllCaps = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const hasLetter = /[A-Za-z]/.test(trimmed);
  return hasLetter && trimmed === trimmed.toUpperCase() && !/[a-z]/.test(trimmed);
};

export function bobifyStatus(value: string): string {
  if (!value) {
    return "Not yet";
  }
  const normalized = value.trim().toLowerCase();
  for (const [pattern, result] of bobStatusMap) {
    if (normalized.includes(pattern)) {
      return result;
    }
  }
  return "Not yet";
}

export function bobifyPrimaryCtaVerb(value: string): string {
  if (!value) {
    return value;
  }
  for (const { pattern, replacement } of primaryVerbReplacements) {
    if (pattern.test(value)) {
      return value.replace(pattern, replacement);
    }
  }
  return value;
}

export function normalizeBobStatus(value?: string | null): string {
  return sanitizeForMessage(value ?? "");
}

export function normalizeBobCtaLabel(value?: string | null): string {
  const trimmed = sanitizeForMessage(value ?? "");
  if (!trimmed) {
    return trimmed;
  }
  const rewritten = bobifyPrimaryCtaVerb(trimmed);
  return sanitizeForMessage(rewritten);
}

export function containsForbiddenBobLanguage(text: string): { ok: boolean; hits: string[] } {
  const input = text ?? "";
  const hits = forbiddenBobPatterns
    .filter(({ pattern }) => pattern.test(input))
    .map(({ label }) => label);
  return { ok: hits.length === 0, hits };
}

export function isLikelyOpenEndedQuestion(text: string): boolean {
  const input = text ?? "";
  return openEndedQuestionPatterns.some((pattern) => pattern.test(input));
}

export function assertBobTone(text: string, contextLabel: string): void {
  const sanitized = text ?? "";
  const violations: string[] = [];

  const forbidden = containsForbiddenBobLanguage(sanitized);
  if (!forbidden.ok) {
    violations.push(`forbidden language (${forbidden.hits.join(", ")})`);
  }

  if (isLikelyOpenEndedQuestion(sanitized)) {
    violations.push("open-ended question");
  }

  if (isAllCaps(sanitized)) {
    violations.push("all-caps text");
  }

  if (violations.length > 0) {
    throw new Error(`[${contextLabel}] Bob voice violation: ${violations.join("; ")}`);
  }
}

export type ComposeBobMessageParts = {
  statement: string;
  recommendation: string;
  question?: string;
};

export function composeBobMessage(parts: ComposeBobMessageParts): string {
  const segments: string[] = [];
  const statement = sanitizeForMessage(parts.statement);
  if (statement) {
    segments.push(statement);
  }
  const recommendation = sanitizeForMessage(parts.recommendation);
  if (recommendation) {
    segments.push(recommendation);
  }
  if (parts.question) {
    let question = parts.question.trim().replace(/[!]+/g, "");
    question = question.endsWith("?") ? question : `${question}?`;
    segments.push(question);
  }
  return segments.join(" ").replace(/\s+/g, " ").trim();
}
