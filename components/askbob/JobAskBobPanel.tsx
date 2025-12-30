"use client";

import { useEffect, useState } from "react";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import AskBobForm from "./AskBobForm";
import AskBobStepReadinessBadge, {
  type AskBobStepReadiness,
} from "@/components/askbob/AskBobStepReadinessBadge";
import type {
  AskBobDiagnoseSnapshotPayload,
  AskBobResponseDTO,
  AskBobTaskSnapshotVersion,
} from "@/lib/domain/askbob/types";
import {
  buildDiagnosisSummary,
  buildDiagnosisSummaryFromSnapshot,
} from "@/lib/domain/askbob/summary";
import { regenerateDiagnosisAction } from "@/app/(app)/askbob/actions";
import { formatSnapshotTimestamp } from "@/lib/domain/askbob/formatters";

export type JobDiagnosisContext = {
  diagnosisSummary: string | null;
  askBobResponseId?: string | null;
};

type JobAskBobPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  quoteId?: string | null;
  onDiagnoseSuccess?: () => void;
  onDiagnoseComplete?: (context: JobDiagnosisContext) => void;
  jobDescription?: string | null;
  jobTitle?: string | null;
  stepCompleted?: boolean;
  stepCollapsed?: boolean;
  onToggleStepCollapsed?: () => void;
  initialDiagnoseSnapshot?: AskBobDiagnoseSnapshotPayload | null;
  diagnosisSnapshotHistory?: AskBobTaskSnapshotVersion<AskBobDiagnoseSnapshotPayload>[];
  latestSnapshotVersion?: AskBobTaskSnapshotVersion<AskBobDiagnoseSnapshotPayload> | null;
  stepReadiness?: AskBobStepReadiness | null;
  embeddedInProgressRow?: boolean;
};

export default function JobAskBobPanel({
  workspaceId,
  jobId,
  customerId,
  quoteId,
  onDiagnoseSuccess,
  onDiagnoseComplete,
  jobDescription,
  jobTitle,
  stepCompleted,
  stepCollapsed = false,
  onToggleStepCollapsed,
  initialDiagnoseSnapshot,
  diagnosisSnapshotHistory = [],
  latestSnapshotVersion = null,
  stepReadiness,
  embeddedInProgressRow = false,
}: JobAskBobPanelProps) {
  useEffect(() => {
    console.log("[askbob-ui-entry]", {
      workspaceId,
      jobId,
      hasCustomerId: Boolean(customerId),
      hasJobTitle: Boolean(jobTitle?.trim()),
      origin: "job-detail",
    });
  }, [workspaceId, jobId, customerId, jobTitle]);

  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const initialResponseFromSnapshot = initialDiagnoseSnapshot
    ? {
        sessionId: initialDiagnoseSnapshot.sessionId,
        responseId: initialDiagnoseSnapshot.responseId,
        createdAt: initialDiagnoseSnapshot.createdAt,
        sections: initialDiagnoseSnapshot.sections,
        materials: initialDiagnoseSnapshot.materials,
      }
    : null;
  const [latestAskBobResponse, setLatestAskBobResponse] = useState<AskBobResponseDTO | null>(
    () => initialResponseFromSnapshot,
  );
  const [latestDiagnosisSummary, setLatestDiagnosisSummary] = useState<string | null>(() =>
    initialResponseFromSnapshot ? buildDiagnosisSummary(initialResponseFromSnapshot) : null,
  );
  const [historyEntries, setHistoryEntries] = useState(
    () => diagnosisSnapshotHistory,
  );
  const [latestSnapshotMeta, setLatestSnapshotMeta] = useState(
    () => latestSnapshotVersion,
  );
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const labelsToShow: string[] = [];
  if (normalizedJobTitle) {
    labelsToShow.push("job title");
  }
  if (normalizedJobDescription) {
    labelsToShow.push("job description");
  }

  const handleResponse = (response: AskBobResponseDTO) => {
    const previousResponse = latestAskBobResponse;
    const summary = buildDiagnosisSummary(response);
    setLatestAskBobResponse(response);
    setLatestDiagnosisSummary(summary);
    setLatestSnapshotMeta({
      id: response.responseId,
      task: "job.diagnose",
      payload: {
        sessionId: response.sessionId,
        responseId: response.responseId,
        createdAt: response.createdAt,
        sections: response.sections,
        materials: response.materials,
      },
      createdAt: response.createdAt,
      createdAtLabel: formatSnapshotTimestamp(response.createdAt),
    });
    if (previousResponse) {
      const previousSnapshot: AskBobDiagnoseSnapshotPayload = {
        sessionId: previousResponse.sessionId,
        responseId: previousResponse.responseId,
        createdAt: previousResponse.createdAt,
        sections: previousResponse.sections,
        materials: previousResponse.materials,
      };
      setHistoryEntries((entries) => [
        {
          id: previousResponse.responseId,
          task: "job.diagnose",
          payload: previousSnapshot,
          createdAt: previousResponse.createdAt,
          createdAtLabel:
            latestSnapshotMeta?.createdAtLabel ?? formatSnapshotTimestamp(previousResponse.createdAt),
        },
        ...entries,
      ]);
    }
    onDiagnoseComplete?.({
      diagnosisSummary: summary,
      askBobResponseId: response.responseId,
    });
  };

  const handleReset = () => {
    setLatestAskBobResponse(null);
    setLatestDiagnosisSummary(null);
    onDiagnoseComplete?.({ diagnosisSummary: null });
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById("askbob-diagnose");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasDiagnosisResult = Boolean(latestAskBobResponse && latestDiagnosisSummary);
  const toggleLabel = stepCollapsed ? "Show section" : "Hide section";
  const handleToggle = () => onToggleStepCollapsed?.();

  const handleRegenerate = async () => {
    if (isRegenerating) {
      return;
    }
    console.log("[askbob-diagnose-regenerate-click]", { workspaceId, jobId });
    setRegenerateError(null);
    setIsRegenerating(true);
    try {
      const result = await regenerateDiagnosisAction({ jobId });
      if (!result.ok) {
        console.log("[askbob-diagnose-regenerate-failure]", {
          workspaceId,
          jobId,
          code: result.code,
        });
        setRegenerateError(result.message);
        return;
      }
      const previousResponse = latestAskBobResponse;
      if (previousResponse) {
        const previousSnapshot: AskBobDiagnoseSnapshotPayload = {
          sessionId: previousResponse.sessionId,
          responseId: previousResponse.responseId,
          createdAt: previousResponse.createdAt,
          sections: previousResponse.sections,
          materials: previousResponse.materials,
        };
        setHistoryEntries((entries) => [
          {
            id: previousResponse.responseId,
            task: "job.diagnose",
            payload: previousSnapshot,
            createdAt: previousResponse.createdAt,
            createdAtLabel:
              latestSnapshotMeta?.createdAtLabel ?? formatSnapshotTimestamp(previousResponse.createdAt),
          },
          ...entries,
        ]);
      }
      setLatestAskBobResponse(result.response);
      setLatestDiagnosisSummary(buildDiagnosisSummary(result.response));
      setLatestSnapshotMeta({
        id: result.versionId,
        task: "job.diagnose",
        payload: {
          sessionId: result.response.sessionId,
          responseId: result.response.responseId,
          createdAt: result.response.createdAt,
          sections: result.response.sections,
          materials: result.response.materials,
        },
        createdAt: result.createdAt,
        createdAtLabel: result.createdAtLabel,
      });
      console.log("[askbob-diagnose-regenerate-success]", {
        workspaceId,
        jobId,
        versionId: result.versionId,
      });
      onDiagnoseComplete?.({
        diagnosisSummary: buildDiagnosisSummary(result.response),
        askBobResponseId: result.response.responseId,
      });
    } catch (error) {
      console.error("[askbob-diagnose-regenerate-error]", error);
      setRegenerateError("AskBob couldn’t regenerate diagnosis. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const historyItems = historyEntries.map((entry) => {
    const summary = buildDiagnosisSummaryFromSnapshot(entry.payload);
    return {
      ...entry,
      summary: summary ?? "Diagnosis summary unavailable.",
    };
  });

  const renderHistoryBody = (entry: AskBobDiagnoseSnapshotPayload) => {
    return entry.sections
      .map((section) => {
        const items = section.items.filter((item) => item.trim());
        const header = section.title?.trim() ? `${section.title.trim()}:` : "Details:";
        return items.length ? `${header}\n${items.map((item) => `- ${item}`).join("\n")}` : null;
      })
      .filter(Boolean)
      .join("\n\n");
  };

  return (
    <HbCard className="space-y-4">
      <div>
        {!embeddedInProgressRow && (
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        )}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {!embeddedInProgressRow && (
                <h2 className="hb-heading-3 text-xl font-semibold">Diagnose</h2>
              )}
              {stepCompleted && (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                  Done
                </span>
              )}
            </div>
            <AskBobStepReadinessBadge readiness={stepReadiness} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleToggle}
            >
              {toggleLabel}
            </HbButton>
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? "Regenerating…" : "Regenerate diagnosis"}
            </HbButton>
            {hasDiagnosisResult && (
              <HbButton
                variant="ghost"
                size="sm"
                className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
                onClick={handleReset}
              >
                Reset section
              </HbButton>
            )}
          </div>
        </div>
        {regenerateError && <p className="text-xs text-rose-400">{regenerateError}</p>}
        {!stepCollapsed && (
          <>
            <p className="text-sm text-slate-400">
              AskBob reviews the job title, description, and your notes to outline how a technician might approach this job safely.
              Confirm site conditions and adjust these recommendations before you act.
            </p>
            <p className="text-xs text-slate-500">
              These are editable starting points—adapt them to the crew and conditions on site.
            </p>
            {labelsToShow.length > 0 ? (
              <p className="text-xs text-muted-foreground">Context used: {labelsToShow.join(", ")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Context used: none yet. Add the job details below so AskBob can reference them.
              </p>
            )}
            <AskBobForm
              key={latestAskBobResponse?.responseId ?? "askbob-diagnose-form"}
              workspaceId={workspaceId}
              jobId={jobId}
              customerId={customerId ?? undefined}
              quoteId={quoteId ?? undefined}
              jobDescription={jobDescription}
              jobTitle={jobTitle}
              onSuccess={onDiagnoseSuccess}
              onResponse={handleResponse}
              initialResponse={latestAskBobResponse ?? undefined}
            />
            {historyItems.length > 0 && (
              <div className="space-y-3 border-t border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    Previous diagnoses
                  </p>
                </div>
                <div className="space-y-2">
                  {historyItems.map((entry) => {
                    const isExpanded = expandedHistoryId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200"
                        data-testid="diagnosis-history-item"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                            {entry.createdAtLabel ?? "Timestamp unavailable"}
                          </p>
                          <HbButton
                            variant="ghost"
                            size="xs"
                            className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
                            onClick={() =>
                              setExpandedHistoryId(isExpanded ? null : entry.id)
                            }
                          >
                            {isExpanded ? "Hide" : "View"}
                          </HbButton>
                        </div>
                        <p className="text-xs text-slate-300">{entry.summary}</p>
                        {isExpanded && (
                          <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                            {renderHistoryBody(entry.payload)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </HbCard>
  );
}
