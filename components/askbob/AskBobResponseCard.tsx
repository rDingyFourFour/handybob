"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { createAskBobJobNoteAction } from "@/app/(app)/askbob/integrations-actions";
import { draftAskBobCustomerMessageAction } from "@/app/(app)/askbob/message-draft-actions";
import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AskBobResponseCardProps = {
  response: AskBobResponseDTO;
  workspaceId: string;
  jobId?: string | null;
  customerId?: string | null;
};

export default function AskBobResponseCard({
  response,
  workspaceId,
  jobId,
  customerId,
}: AskBobResponseCardProps) {
  const createdAt = new Date(response.createdAt);
  const formattedDate = Number.isNaN(createdAt.getTime())
    ? response.createdAt
    : TIMESTAMP_FORMATTER.format(createdAt);

  const hasMaterials = Boolean(response.materials && response.materials.length > 0);
  const hasSections = response.sections.length > 0;
  const [jobNoteStatus, setJobNoteStatus] = useState<string | null>(null);
  const [jobNoteError, setJobNoteError] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isJobNotePending, setIsJobNotePending] = useState(false);
  const [isDraftPending, setIsDraftPending] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const canDraftMessage = Boolean(workspaceId);

  return (
    <HbCard className="space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-100">AskBob suggestions</p>
        <p className="text-xs text-slate-400">Generated at {formattedDate}</p>
      </div>

      {(jobId || canDraftMessage) && (
        <div className="flex flex-wrap items-center gap-2">
          {jobId && (
            <HbButton
              variant="secondary"
              size="sm"
              disabled={isJobNotePending}
              onClick={() => {
                setJobNoteStatus(null);
                setJobNoteError(null);
                startTransition(() => {
                  setIsJobNotePending(true);
                  console.log("[askbob-ui-job-note-click]", {
                    workspaceId,
                    jobId,
                    askbobResponseId: response.responseId,
                  });
                  void createAskBobJobNoteAction({
                    workspaceId,
                    jobId,
                    askbobResponseId: response.responseId,
                  })
                    .then(() => {
                      setJobNoteStatus("Saved to job notes.");
                    })
                    .catch((error) => {
                      console.error("[askbob-ui-job-note] Failed to create job note", error);
                      setJobNoteError("Unable to save the note right now.");
                    })
                    .finally(() => {
                      setIsJobNotePending(false);
                    });
                });
              }}
            >
              {isJobNotePending ? "Saving…" : "Save as job note"}
            </HbButton>
          )}

          {canDraftMessage && (
            <HbButton
              variant="ghost"
              size="sm"
              disabled={isDraftPending}
              onClick={() => {
                setDraftBody(null);
                setDraftError(null);
                startTransition(() => {
                  setIsDraftPending(true);
                  console.log("[askbob-ui-message-draft-click]", {
                    workspaceId,
                    customerId,
                    jobId: jobId ?? null,
                    askbobResponseId: response.responseId,
                  });
                  void draftAskBobCustomerMessageAction({
                    workspaceId,
                    jobId: jobId ?? null,
                    customerId,
                    purpose: "Follow up about the work discussed in this AskBob suggestion.",
                    tone: "friendly",
                    extraDetails: "Keep the response concise and homeowner-facing.",
                  })
                    .then((draft) => {
                      setDraftBody(draft.body);
                    })
                    .catch((error) => {
                      console.error("[askbob-ui-message-draft] Failed to prepare draft", error);
                      setDraftError("Couldn’t create a customer draft. Please try again.");
                    })
                    .finally(() => {
                      setIsDraftPending(false);
                    });
                });
              }}
            >
              {isDraftPending ? "Drafting…" : "Draft customer message"}
            </HbButton>
          )}
        </div>
      )}

      {jobNoteStatus && <p className="text-xs text-emerald-400">{jobNoteStatus}</p>}
      {jobNoteError && <p className="text-xs text-rose-400">{jobNoteError}</p>}
      {draftError && <p className="text-xs text-rose-400">{draftError}</p>}
      {draftBody && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-xs text-slate-200">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Customer-ready message draft
          </p>
          <p className="mt-2 whitespace-pre-wrap">{draftBody}</p>
          {workspaceId && customerId && (
            <div className="mt-3 text-right">
              <HbButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const bodyForQuery = draftBody.trim();
                  if (!bodyForQuery) {
                    return;
                  }
                  console.log("[askbob-ui-message-draft-use]", {
                    workspaceId,
                    jobId: jobId ?? null,
                    customerId,
                    hasDraftBody: Boolean(bodyForQuery),
                    origin: "askbob",
                  });
                  const params = new URLSearchParams();
                  params.set("compose", "1");
                  params.set("customerId", customerId);
                  if (jobId) {
                    params.set("jobId", jobId);
                  }
                  params.set("origin", "askbob");
                  params.set("draftBody", bodyForQuery);
                  router.push(`/messages?${params.toString()}`);
                }}
              >
                Use in message
              </HbButton>
            </div>
          )}
        </div>
      )}

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
