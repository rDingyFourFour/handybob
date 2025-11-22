"use server";

import { buildJobTimelinePayload } from "@/utils/ai/jobTimelinePayload";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses"; // OpenAI Responses API
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini"; // small, fast contractor-facing model

type JobSummaryState = {
  summary?: string;
  error?: string;
};

type OpenAIContentChunk = {
  text?: string[];
};

type OpenAIResponseBody = {
  output?: {
    content?: OpenAIContentChunk[];
  }[];
};

export async function generateJobSummary(
  _prev: JobSummaryState | null,
  formData: FormData,
): Promise<JobSummaryState> {
  const jobId = formData.get("job_id");
  if (typeof jobId !== "string") {
    return { error: "Job ID is required." };
  }

  try {
    const supabase = createServerClient();
    const { workspace } = await getCurrentWorkspace({ supabase });

    const timelinePayload = await buildJobTimelinePayload(jobId, workspace.id); // scoped to workspace + capped history to avoid leaking other jobs/users

    const prompt = `
You are HandyBob's assistant for contractors.
Summarize this job in 3–6 sentences, using contractor-friendly language.
Focus on what the job is, what's been done, what's outstanding, and any special notes about the customer.
Keep it concise and factual, no fluff.

Job timeline data (JSON):
${JSON.stringify(timelinePayload)}`.trim();

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return { error: "OPENAI_API_KEY is not configured." };
    }

    const aiResponse = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: prompt,
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      return { error: `OpenAI request failed: ${errorBody}` };
    }

    const body = (await aiResponse.json()) as OpenAIResponseBody;
    const summary = extractText(body);

    return summary ? { summary } : { error: "No summary returned." };
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Unexpected error while generating summary." };
  }
}

function extractText(payload: OpenAIResponseBody): string | null {
  // Expected Responses API shape: { output: [{ content: [{ text: ["..."] }]}]}
  const output = payload?.output?.[0];
  const content = output?.content;

  if (Array.isArray(content)) {
    const textChunk = content.find(
      (chunk: OpenAIContentChunk) => Array.isArray(chunk?.text) && chunk.text.length > 0,
    );
    if (textChunk?.text?.[0]) {
      return String(textChunk.text[0]).trim();
    }
  }

  if (typeof output?.content?.[0]?.text?.[0] === "string") {
    return String(output.content[0].text[0]).trim();
  }

  return null;
}

// Manual AI test checklist (UI):
// - Job summary: trigger “Generate summary” on a job with timeline data; expect 3–6 sentence recap using only that job’s history.
// - Follow-up drafts: request email/SMS follow-up; expect goal/tone reflected and no cross-job/customer info.
// - Next actions: request next actions; expect 3 actionable suggestions derived from the job timeline only.
// - Customer summary: on a customer profile, generate summary/check-in draft; expect content based solely on that customer’s history in the workspace.
