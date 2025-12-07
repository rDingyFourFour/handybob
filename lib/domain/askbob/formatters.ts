import type { AskBobResponseDTO } from "./types";

type JobNoteContext = {
  jobId: string;
  quoteId?: string | null;
};

type CustomerDraftContext = {
  jobId?: string | null;
  quoteId?: string | null;
};

const MAX_STEPS_NOTE = 4;
const MAX_STEPS_MESSAGE = 3;

export function formatAskBobJobNote(
  response: AskBobResponseDTO,
  context: JobNoteContext
): string {
  const lines: string[] = [
    "Tech note: AskBob recommendations for this job.",
  ];

  const stepsSection = response.sections.find((section) => section.type === "steps");
  if (stepsSection && stepsSection.items.length > 0) {
    const selectedSteps = stepsSection.items.slice(0, MAX_STEPS_NOTE);
    lines.push(
      `Steps:\n${selectedSteps
        .map((step, index) => `${index + 1}. ${step}`)
        .join("\n")}`
    );
  }

  if (response.materials && response.materials.length > 0) {
    const materialsLine = response.materials
      .map((material) => {
        const components = [material.name];
        if (material.quantity) {
          components.push(`Qty: ${material.quantity}`);
        }
        if (material.notes) {
          components.push(material.notes);
        }
        return components.join(" · ");
      })
      .join("\n");

    lines.push(`Materials:\n${materialsLine}`);
  }

  if (response.safetyCautions && response.safetyCautions.length > 0) {
    lines.push(`Safety:\n- ${response.safetyCautions.join("\n- ")}`);
  }

  if (response.escalationGuidance && response.escalationGuidance.length > 0) {
    lines.push(`Escalation triggers:\n- ${response.escalationGuidance.join("\n- ")}`);
  }

  if (context.quoteId) {
    lines.push(`Reference quote: ${context.quoteId}`);
  }

  lines.push(`Job ID: ${context.jobId}`);

  return lines.join("\n\n");
}

export function formatAskBobCustomerDraft(
  response: AskBobResponseDTO,
  context: CustomerDraftContext
): string {
  void context;
  const stepsSection = response.sections.find((section) => section.type === "steps");
  const stepSummary = stepsSection?.items.slice(0, MAX_STEPS_MESSAGE).join(" → ");
  const safetySummary = response.safetyCautions?.slice(0, 2).join(" · ");
  const costSummary = response.costTimeConsiderations?.slice(0, 2).join(" · ");
  const escalationSummary = response.escalationGuidance?.slice(0, 2).join(" · ");

  const parts: string[] = [
    "Hi, here's what I'm planning for this visit.",
    stepSummary ? `Plan: ${stepSummary}` : undefined,
    costSummary ? `What to expect: ${costSummary}` : undefined,
    safetySummary ? `Safety: ${safetySummary}` : undefined,
    escalationSummary ? `Escalation: ${escalationSummary}` : undefined,
    "I'll keep you posted as I make progress.",
  ].filter((part): part is string => Boolean(part));

  return parts.join("\n\n");
}
