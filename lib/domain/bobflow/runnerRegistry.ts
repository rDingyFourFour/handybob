import type { AskBobJobTaskSnapshotTask } from "@/lib/domain/askbob/types";
import { regenerateAskBobMaterialsAction } from "@/app/(app)/askbob/materials-actions";
import { regenerateAskBobQuoteAction } from "@/app/(app)/askbob/quote-actions";
import { regenerateDiagnosisAction } from "@/app/(app)/askbob/actions";
import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";

export type InternalProgressScenario =
  | "Internal.diagnose"
  | "Internal.materials"
  | "Internal.quotes"
  | "Internal.msg";

export type InternalRunnerInvocationArgs = {
  workspaceId: string;
  jobId: string;
};

type RunnerPayload<Fn> = Fn extends (payload: infer Payload) => Promise<unknown> ? Payload : never;

type InternalRunnerEntry<Fn> = {
  task: AskBobJobTaskSnapshotTask;
  runner: Fn;
  buildPayload: (args: InternalRunnerInvocationArgs) => RunnerPayload<Fn>;
};

export const internalRunnerOrder: InternalProgressScenario[] = [
  "Internal.diagnose",
  "Internal.materials",
  "Internal.quotes",
  "Internal.msg",
];

export const internalRunnerRegistry = {
  // app/(app)/askbob/actions.ts (regenerateDiagnosisAction handles the Diagnose step)
  "Internal.diagnose": {
    task: "job.diagnose",
    runner: regenerateDiagnosisAction,
    buildPayload: ({ jobId }) => ({ jobId }),
  },
  // app/(app)/askbob/materials-actions.ts (regenerateAskBobMaterialsAction powers the Materials step)
  "Internal.materials": {
    task: "materials.generate",
    runner: regenerateAskBobMaterialsAction,
    buildPayload: ({ jobId }) => ({ jobId }),
  },
  // app/(app)/askbob/quote-actions.ts (regenerateAskBobQuoteAction powers the Quote step)
  "Internal.quotes": {
    task: "quote.generate",
    runner: regenerateAskBobQuoteAction,
    buildPayload: ({ jobId }) => ({ jobId }),
  },
  // app/(app)/askbob/followup-actions.ts (runAskBobJobFollowupAction runs the Follow-up step)
  "Internal.msg": {
    task: "job.followup",
    runner: runAskBobJobFollowupAction,
    buildPayload: ({ workspaceId, jobId }) => ({ workspaceId, jobId }),
  },
} as const satisfies Record<
  InternalProgressScenario,
  InternalRunnerEntry<(payload: unknown) => Promise<unknown>>
>;

export type InternalRunnerRegistry = typeof internalRunnerRegistry;
