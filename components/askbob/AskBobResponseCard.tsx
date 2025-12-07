"use client";

import HbCard from "@/components/ui/hb-card";
import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AskBobResponseCardProps = {
  response: AskBobResponseDTO;
};

export default function AskBobResponseCard({ response }: AskBobResponseCardProps) {
  const createdAt = new Date(response.createdAt);
  const formattedDate = Number.isNaN(createdAt.getTime())
    ? response.createdAt
    : TIMESTAMP_FORMATTER.format(createdAt);

  const hasMaterials = Boolean(response.materials && response.materials.length > 0);
  const hasSections = response.sections.length > 0;

  return (
    <HbCard className="space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-100">AskBob suggestions</p>
        <p className="text-xs text-slate-400">Generated at {formattedDate}</p>
      </div>

      {hasMaterials && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Materials</p>
          <div className="space-y-1 text-sm text-slate-200">
            {response.materials!.map((material, index) => {
              const quantityLabel = material.quantity ? ` — Qty: ${material.quantity}` : "";
              const notesLabel = material.notes ? ` (${material.notes})` : "";
              return (
                <p key={`${material.name}-${index}`} className="text-sm leading-snug text-slate-200">
                  <span className="font-semibold text-slate-100">{material.name}</span>
                  {quantityLabel}
                  {notesLabel}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {hasSections ? (
        response.sections.map((section) => (
          <div key={section.type} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{section.title}</p>
            {section.type === "steps" ? (
              <ol className="space-y-1 pl-5 text-sm text-slate-200 list-decimal marker:text-slate-400">
                {section.items.map((item, index) => (
                  <li key={`${section.type}-${index}`} className="leading-snug">
                    {item}
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="space-y-1 pl-5 text-sm text-slate-200 list-disc marker:text-slate-400">
                {section.items.map((item, index) => (
                  <li key={`${section.type}-${index}`} className="leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-400">No recommendations were returned for this prompt.</p>
      )}
    </HbCard>
  );
}
