import { adaptAskBobMaterialsToSmartQuote, summarizeMaterialsSuggestion } from "@/lib/domain/quotes/materials-askbob-adapter";
import type {
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobMaterialsGenerateResult,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
  AskBobResponseDTO,
} from "./types";

function normalizeItems(sectionItems: string[]) {
  return sectionItems
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function normalizeNullableString(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function buildDiagnosisSummary(
  response: AskBobResponseDTO | null | undefined,
): string | null {
  if (!response) {
    return null;
  }
  const sections = Array.isArray(response.sections) ? response.sections : [];
  if (!sections.length) {
    return null;
  }

  const stepsSection =
    sections.find((section) => section.type === "steps" && section.items.some(Boolean)) ??
    sections.find((section) => section.items.some(Boolean));
  const stepItems = stepsSection ? normalizeItems(stepsSection.items) : [];
  const majorScope = stepItems.length
    ? `${stepsSection?.title ?? "Diagnosis"}: ${stepItems.join("; ")}`
    : null;

  const safetySection = sections.find(
    (section) => section.type === "safety" && section.items.some(Boolean),
  );
  const safetyItem = safetySection?.items.map((item) => item.trim()).find(Boolean) ?? null;

  const summaryParts: string[] = [];
  if (majorScope) {
    summaryParts.push(majorScope);
  }
  if (safetyItem) {
    summaryParts.push(`Safety note: ${safetyItem}`);
  }

  if (!summaryParts.length) {
    return null;
  }

  const summary = summaryParts.join(" ").trim();
  return summary.length ? summary : null;
}

export function buildDiagnosisSummaryFromSnapshot(
  snapshot: AskBobDiagnoseSnapshotPayload | null | undefined,
): string | null {
  if (!snapshot) {
    return null;
  }
  const dto: AskBobResponseDTO = {
    sessionId: snapshot.sessionId,
    responseId: snapshot.responseId,
    createdAt: snapshot.createdAt,
    sections: snapshot.sections,
    materials: snapshot.materials,
  };
  return buildDiagnosisSummary(dto);
}

export function buildMaterialsSummaryFromSnapshot(
  snapshot: AskBobMaterialsSnapshotPayload | null | undefined,
): string | null {
  if (!snapshot) {
    return null;
  }
  const result: AskBobMaterialsGenerateResult = {
    items: snapshot.items,
    notes: snapshot.notes ?? null,
    modelLatencyMs: 0,
    rawModelOutput: null,
  };
  const adapted = adaptAskBobMaterialsToSmartQuote(result);
  return summarizeMaterialsSuggestion(adapted);
}

export function buildQuoteSummaryFromSnapshot(
  snapshot: AskBobQuoteSnapshotPayload | null | undefined,
): string | null {
  if (!snapshot) {
    return null;
  }
  const parts: string[] = [];
  const lineCount = Array.isArray(snapshot.lines) ? snapshot.lines.length : 0;
  if (lineCount) {
    parts.push(`AskBob drafted ${lineCount} quote line${lineCount === 1 ? "" : "s"}.`);
  }
  const materialCount = snapshot.materials?.length ?? 0;
  if (materialCount) {
    parts.push(`Includes ${materialCount} material${materialCount === 1 ? "" : "s"}.`);
  }
  const notes = normalizeNullableString(snapshot.notes);
  if (notes) {
    parts.push(`Notes: ${notes}`);
  }
  return parts.length ? parts.join(" ") : null;
}

export function buildFollowupSummaryFromSnapshot(
  snapshot: AskBobFollowupSnapshotPayload | null | undefined,
): string | null {
  if (!snapshot) {
    return null;
  }
  const parts: string[] = [];
  const action = normalizeNullableString(snapshot.recommendedAction);
  if (action) {
    parts.push(action);
  }
  const rationale = normalizeNullableString(snapshot.rationale);
  if (rationale) {
    parts.push(rationale);
  }
  return parts.length ? parts.join(" ") : null;
}

export const ASKBOB_AUTOMATED_SCRIPT_SUMMARY_LIMIT = 900;

export function truncateAskBobScriptSummary(value: string, limit = ASKBOB_AUTOMATED_SCRIPT_SUMMARY_LIMIT) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}…`;
}
