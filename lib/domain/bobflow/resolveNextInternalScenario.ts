import type { AskBobJobTaskSnapshotTask } from "@/lib/domain/askbob/types";
import type { InternalProgressScenario } from "./runnerRegistry";

export type SnapshotRecord = {
  task: AskBobJobTaskSnapshotTask;
  payload: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasNonEmptyStrings = (items?: unknown[]): boolean =>
  Array.isArray(items) && items.some((item) => typeof item === "string" && item.trim().length > 0);

export const isUsableDiagnoseSnapshot = (
  payload: unknown,
): payload is { sections: { items: unknown[] }[] } => {
  if (!isObject(payload)) {
    return false;
  }
  const { sections } = payload as Record<string, unknown>;
  if (!Array.isArray(sections) || !sections.length) {
    return false;
  }
  return sections.some((section) => Array.isArray(section.items) && hasNonEmptyStrings(section.items));
};

export const isUsableMaterialsSnapshot = (payload: unknown): payload is { items: unknown[] } => {
  if (!isObject(payload)) {
    return false;
  }
  const { items } = payload as Record<string, unknown>;
  return Array.isArray(items) && items.some((item) => {
    if (!isObject(item)) {
      return false;
    }
    const name = (item as Record<string, unknown>).name;
    return typeof name === "string" && name.trim().length > 0;
  });
};

export const isUsableQuoteSnapshot = (payload: unknown): payload is { lines: unknown[] } => {
  if (!isObject(payload)) {
    return false;
  }
  const { lines } = payload as Record<string, unknown>;
  return Array.isArray(lines) && lines.some((line) => {
    if (!isObject(line)) {
      return false;
    }
    const quantity = (line as Record<string, unknown>).quantity;
    const description = (line as Record<string, unknown>).description;
    return (typeof description === "string" && description.trim().length > 0) ||
      (typeof quantity === "number" && quantity > 0);
  });
};

const findSnapshot = (snapshots: SnapshotRecord[], task: AskBobJobTaskSnapshotTask) =>
  snapshots.find((snapshot) => snapshot.task === task);

export type NextInternalScenario = InternalProgressScenario | null;

export const resolveNextInternalScenario = (
  snapshots: SnapshotRecord[] | null | undefined,
): NextInternalScenario => {
  const rows = snapshots ?? [];
  if (!isUsableDiagnoseSnapshot(findSnapshot(rows, "job.diagnose")?.payload)) {
    return "Internal.diagnose";
  }
  if (!isUsableMaterialsSnapshot(findSnapshot(rows, "materials.generate")?.payload)) {
    return "Internal.materials";
  }
  if (!isUsableQuoteSnapshot(findSnapshot(rows, "quote.generate")?.payload)) {
    return "Internal.quotes";
  }
  return null;
};

export const internalSnapshotGuards = {
  diagnose: isUsableDiagnoseSnapshot,
  materials: isUsableMaterialsSnapshot,
  quote: isUsableQuoteSnapshot,
};
