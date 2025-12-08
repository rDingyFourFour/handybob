import type {
  AskBobMaterialItemResult,
  AskBobMaterialsGenerateResult,
} from "@/lib/domain/askbob/types";
import type {
  SmartQuoteMaterialLine,
  SmartQuoteSuggestion,
} from "@/lib/domain/quotes/askbob-adapter";

export function adaptAskBobMaterialsToSmartQuote(
  result: AskBobMaterialsGenerateResult
): SmartQuoteSuggestion {
  const materials =
    result.items && result.items.length
      ? result.items.map(mapMaterialLine)
      : undefined;

  return {
    scopeLines: [],
    materials,
    notes: normalizeNullableString(result.notes) ?? undefined,
    subtotal: null,
    tax: null,
    total: null,
  };
}

function mapMaterialLine(
  material: AskBobMaterialItemResult
): SmartQuoteMaterialLine {
  return {
    name: material.name,
    quantity: Number.isFinite(material.quantity) ? material.quantity : 0,
    unit: material.unit ?? null,
    estimatedUnitCost: Number.isFinite(material.estimatedUnitCost ?? NaN)
      ? material.estimatedUnitCost ?? null
      : null,
    estimatedTotalCost: Number.isFinite(material.estimatedTotalCost ?? NaN)
      ? material.estimatedTotalCost ?? null
      : null,
  };
}

function normalizeNullableString(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
