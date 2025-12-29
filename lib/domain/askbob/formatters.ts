import type {
  AskBobMaterialItem,
  AskBobResponseDTO,
  AskBobResponseDTOSection,
  AskBobSection,
} from "./types";

type FormatAskBobContext = {
  jobId?: string | null;
  quoteId?: string | null;
};

type SectionFormatterOptions = {
  bullet?: string;
  orderedSteps?: boolean;
};

const SECTION_TITLE_FALLBACKS: Record<AskBobSection, string> = {
  steps: "Steps",
  materials: "Materials",
  safety: "Safety cautions",
  costTime: "Cost and time considerations",
  escalation: "Escalation guidance",
};

function formatSectionBlock(
  section: AskBobResponseDTOSection,
  options: SectionFormatterOptions
): string | null {
  const items = (section.items ?? [])
    .map((item) => item?.trim())
    .filter(Boolean);
  if (!items.length) {
    return null;
  }

  const header = section.title?.trim() || SECTION_TITLE_FALLBACKS[section.type];
  const bullet = options.bullet ?? "-";
  const formattedItems = items.map((item, index) => {
    if (options.orderedSteps && section.type === "steps") {
      return `${index + 1}. ${item}`;
    }
    return `${bullet} ${item}`;
  });

  return `${header}\n${formattedItems.join("\n")}`;
}

function formatSectionBlocks(
  sections: AskBobResponseDTOSection[] | null | undefined,
  options: SectionFormatterOptions
): string[] {
  if (!sections?.length) {
    return [];
  }
  return sections
    .map((section) => formatSectionBlock(section, options))
    .filter((block): block is string => Boolean(block));
}

function formatMaterialBlock(materials: AskBobMaterialItem[] | null | undefined): string | null {
  if (!materials?.length) {
    return null;
  }
  const entries = materials
    .map((material) => {
      const parts = [material.name?.trim()].filter(Boolean);
      const quantity = material.quantity?.trim();
      if (quantity) {
        parts.push(`Qty: ${quantity}`);
      }
      const notes = material.notes?.trim();
      if (notes) {
        parts.push(notes);
      }
      return parts.join(" · ");
    })
    .filter(Boolean);
  if (!entries.length) {
    return null;
  }
  return `Materials\n${entries.map((entry) => `- ${entry}`).join("\n")}`;
}

function buildJobContextHeader(context: FormatAskBobContext): string {
  const contextParts: string[] = [];
  if (context.jobId) {
    contextParts.push(`Job ${context.jobId}`);
  }
  if (context.quoteId) {
    contextParts.push(`Quote ${context.quoteId}`);
  }
  if (!contextParts.length) {
    return "AskBob job note";
  }
  return `AskBob job note · ${contextParts.join(" · ")}`;
}

export function formatAskBobJobNote(
  dto: AskBobResponseDTO,
  context: FormatAskBobContext = {}
): string {
  const blocks = formatSectionBlocks(dto.sections, { bullet: "-", orderedSteps: true });
  const materialBlock = formatMaterialBlock(dto.materials);
  const bodyBlocks = materialBlock ? [...blocks, materialBlock] : blocks;
  const fallback =
    bodyBlocks.length === 0
      ? ["AskBob did not return any structured insights for this response."]
      : bodyBlocks;
  return [buildJobContextHeader(context), ...fallback].join("\n\n");
}

export function formatAskBobCustomerDraft(
  dto: AskBobResponseDTO,
  _context: FormatAskBobContext = {}
): string {
  void _context;
  const introduction = ["Hi,", "Here's a quick recap of AskBob's latest suggestions."];
  const blocks = formatSectionBlocks(dto.sections, { bullet: "-", orderedSteps: true });
  const materialBlock = formatMaterialBlock(dto.materials);
  const summaryBlocks = materialBlock ? [...blocks, materialBlock] : blocks;
  const body =
    summaryBlocks.length === 0
      ? [
          "AskBob did not return any structured insights for this response.",
        "I'll follow up once more information is available.",
        ]
      : summaryBlocks;
  const closing =
    "Let me know if you have any questions or want me to help move forward.";
  return [...introduction, ...body, closing].join("\n\n");
}

export function formatSnapshotTimestamp(isoTimestamp: string | null | undefined): string | null {
  if (!isoTimestamp) {
    return null;
  }
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const iso = parsed.toISOString();
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}
