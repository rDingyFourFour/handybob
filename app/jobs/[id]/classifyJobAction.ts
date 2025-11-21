// app/jobs/[id]/classifyJobAction.ts
"use server";

import { revalidatePath } from "next/cache";

import { classifyJobWithAi } from "@/utils/ai/classifyJob";
import { createServerClient } from "@/utils/supabase/server";
import { runLeadAutomations } from "@/utils/automation/runLeadAutomations";

type JobRow = {
  id: string;
  title: string | null;
  description_raw: string | null;
  description_ai_summary: string | null;
  status: string | null;
  customers?:
    | { name: string | null }
    | { name: string | null }[]
    | null;
};

export async function classifyJobAction(formData: FormData) {
  const jobId = formData.get("job_id");
  if (typeof jobId !== "string") return;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description_raw, description_ai_summary, status, customers(name)")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle<JobRow>();

  if (!job) return;

  const classification = await classifyJobWithAi({
    jobId,
    userId: user.id,
    title: job.title,
    description: job.description_ai_summary || job.description_raw,
  });

  if (job.status === "lead" && classification?.ai_urgency === "emergency") {
    const customerName = Array.isArray(job.customers)
      ? job.customers[0]?.name ?? null
      : job.customers?.name ?? null;

    await runLeadAutomations({
      userId: user.id,
      jobId,
      title: job.title,
      customerName,
      summary: job.description_ai_summary || job.description_raw || null,
      aiUrgency: classification.ai_urgency,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
}
