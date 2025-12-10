import type { AskBobResponseDTO } from "./types";

function normalizeItems(sectionItems: string[]) {
  return sectionItems
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function buildDiagnosisSummary(response: AskBobResponseDTO): string | null {
  const stepsSection =
    response.sections.find((section) => section.type === "steps" && section.items.some(Boolean)) ??
    response.sections.find((section) => section.items.some(Boolean));
  const stepItems = stepsSection ? normalizeItems(stepsSection.items) : [];
  const majorScope = stepItems.length ? `${stepsSection?.title ?? "Diagnosis"}: ${stepItems.join("; ")}` : null;

  const safetySection = response.sections.find(
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
