"use client";

import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

type JobNewAskBobHelperProps = {
  initialTitle?: string;
  initialDescription?: string;
};

export default function JobNewAskBobHelper({
  initialTitle,
  initialDescription,
}: JobNewAskBobHelperProps) {
  const router = useRouter();
  const normalizedTitle = initialTitle?.trim() ?? "";
  const normalizedDescription = initialDescription?.trim() ?? "";
  const hasTitlePrefill = Boolean(normalizedTitle);
  const hasDescriptionPrefill = Boolean(normalizedDescription);

  const handleOpenAskBob = () => {
    const params = new URLSearchParams();
    if (hasTitlePrefill) {
      params.set("title", normalizedTitle);
    }
    if (hasDescriptionPrefill) {
      params.set("description", normalizedDescription);
    }
    params.set("origin", "jobs-new");
    console.log("[jobs-new-askbob-click]", {
      hasTitlePrefill,
      hasDescriptionPrefill,
      titleLength: normalizedTitle.length,
      descriptionLength: normalizedDescription.length,
    });
    router.push(`/askbob?${params.toString()}`);
  };

  return (
    <HbCard className="space-y-3 border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob helper</p>
      <h2 className="hb-heading-3 text-xl font-semibold">Need help describing this job?</h2>
      <p className="text-sm text-slate-400">
        AskBob can brainstorm scope, risks, and materials before you save the job. Open a new session with the
        details you already have so you can export a plan or jump back here later.
      </p>
      <div className="space-y-2">
        <HbButton type="button" variant="primary" onClick={handleOpenAskBob}>
          Open AskBob with this job
        </HbButton>
        <p className="text-[11px] text-slate-500">
          AskBob opens in a new view, and you can create a job from the result when you’re ready.
        </p>
      </div>
    </HbCard>
  );
}
