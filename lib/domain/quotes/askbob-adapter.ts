import type {
  AskBobQuoteGenerateResult,
  AskBobQuoteLineResult,
  AskBobQuoteMaterialLineResult,
} from "@/lib/domain/askbob/types";

export type SmartQuoteScopeLine = {
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
};

export type SmartQuoteMaterialLine = {
  name: string;
  quantity: number;
  unit?: string | null;
  estimatedUnitCost?: number | null;
  estimatedTotalCost?: number | null;
};

export type SmartQuoteSuggestion = {
  scopeLines: SmartQuoteScopeLine[];
  materials?: SmartQuoteMaterialLine[] | null;
  notes?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
};

export function adaptAskBobQuoteToSmartQuote(
  proposal: AskBobQuoteGenerateResult
): SmartQuoteSuggestion {
  const scopeLines = proposal.lines.map(mapScopeLine);
  const subtotal = computeSubtotal(scopeLines);

  const materials =
    proposal.materials && proposal.materials.length
      ? proposal.materials.map(mapMaterialLine)
      : undefined;

  return {
    scopeLines,
    materials,
    notes: normalizeNullableString(proposal.notes) ?? undefined,
    subtotal,
    tax: null,
    total: subtotal ?? null,
  };
}

export function estimateSmartQuoteTotals(suggestion: SmartQuoteSuggestion) {
  const subtotal = suggestion.subtotal ?? computeSubtotal(suggestion.scopeLines);
  const tax = suggestion.tax ?? 0;
  const total = suggestion.total ?? (subtotal ?? 0) + tax;
  return {
    subtotal,
    tax,
    total,
  };
}

function mapScopeLine(line: AskBobQuoteLineResult): SmartQuoteScopeLine {
  return {
    description: line.description,
    quantity: Number.isFinite(line.quantity) ? line.quantity : 0,
    unit: line.unit ?? null,
    unitPrice: Number.isFinite(line.unitPrice ?? NaN) ? line.unitPrice ?? null : null,
    lineTotal: Number.isFinite(line.lineTotal ?? NaN) ? line.lineTotal ?? null : null,
  };
}

function mapMaterialLine(
  material: AskBobQuoteMaterialLineResult
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

function computeSubtotal(lines: SmartQuoteScopeLine[]): number | null {
  const totals = lines
    .map((line) => {
      if (Number.isFinite(line.lineTotal ?? NaN)) {
        return line.lineTotal ?? 0;
      }
      if (Number.isFinite(line.unitPrice ?? NaN) && Number.isFinite(line.quantity ?? NaN)) {
        return (line.unitPrice ?? 0) * (line.quantity ?? 1);
      }
      return null;
    })
    .filter((value): value is number => Number.isFinite(value));

  if (!totals.length) {
    return null;
  }

  return totals.reduce((sum, value) => sum + value, 0);
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
