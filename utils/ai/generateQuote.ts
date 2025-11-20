// utils/ai/generateQuote.ts
"use server";

import { redirect } from "next/navigation";

import { ensurePricingSettings } from "@/utils/ensurePricingSettings";
import { createServerClient } from "@/utils/supabase/server";

type GeneratedQuote = {
  scope_of_work: string;
  labor_hours_estimate: number;
  materials: {
    item: string;
    quantity: number;
    unit_cost: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  client_message: string;
};

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type OpenAIContentChunk = {
  type?: string;
  json?: unknown;
  text?: string[];
};

type OpenAIResponseBody = {
  output?: {
    content?: OpenAIContentChunk[];
  }[];
};

type RawMaterial = {
  item?: unknown;
  quantity?: unknown;
  unit_cost?: unknown;
};

type RawQuote = {
  scope_of_work?: unknown;
  labor_hours_estimate?: unknown;
  materials?: RawMaterial[];
  subtotal?: unknown;
  tax?: unknown;
  total?: unknown;
  client_message?: unknown;
};

export async function generateQuoteForJob(formData: FormData) {
  const jobId = formData.get("job_id");
  if (!isUuid(jobId)) {
    throw new Error("Job ID is required to generate a quote.");
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) {
    redirect("/login");
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, title, description_raw, category, customer_id")
    .eq("id", jobId)
    .single();

  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error("Job not found.");

  const settings = await ensurePricingSettings({
    supabase,
    userId: user.id,
  });

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const prompt = buildPrompt(job.description_raw, {
    hourly_rate: settings.hourly_rate,
    minimum_job_fee: settings.minimum_job_fee ?? 0,
    travel_fee: settings.travel_fee ?? 0,
    category: job.category ?? "General",
  });

  const aiResponse = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: prompt,
      response_format: { type: "json_object" },
    }),
  });

  if (!aiResponse.ok) {
    const errorBody = await aiResponse.text();
    throw new Error(`OpenAI request failed: ${errorBody}`);
  }

  const responseBody: OpenAIResponseBody = await aiResponse.json();
  const quote = extractQuoteFromResponse(responseBody);

  const { data: quoteRow, error: insertError } = await supabase
    .from("quotes")
    .insert({
      user_id: user.id,
      job_id: job.id,
      customer_id: job.customer_id,
      line_items: [
        {
          scope: quote.scope_of_work,
          hours: quote.labor_hours_estimate,
          materials: quote.materials,
        },
      ],
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      client_message_template: quote.client_message,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  redirect(`/quotes/${quoteRow.id}`);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function buildPrompt(
  jobDescription: string | null,
  {
    hourly_rate,
    minimum_job_fee,
    travel_fee,
    category,
  }: {
    hourly_rate: number;
    minimum_job_fee: number;
    travel_fee: number;
    category: string;
  }
) {
  return `
You are HandyBob's AI quoting assistant. Produce a JSON quote summary with the following structure:
{
  "scope_of_work": "text summary",
  "labor_hours_estimate": number,
  "materials": [
    { "item": "name", "quantity": number, "unit_cost": number }
  ],
  "subtotal": number,
  "tax": number,
  "total": number,
  "client_message": "text sent to customer"
}

Job details:
- Category: ${category}
- Description: ${jobDescription || "No description provided"}

Pricing context:
- Hourly rate: $${hourly_rate.toFixed(2)}
- Minimum job fee: $${minimum_job_fee.toFixed(2)}
- Travel fee: $${travel_fee.toFixed(2)}

Assume an 8.5% tax rate and keep recommendations grounded in the provided rates.
`.trim();
}

function extractQuoteFromResponse(payload: OpenAIResponseBody): GeneratedQuote {
  const primaryOutput = payload?.output?.[0];
  if (!primaryOutput) {
    throw new Error("OpenAI response did not include any output.");
  }

  const contentArray: OpenAIContentChunk[] = primaryOutput?.content ?? [];
  const jsonChunk = contentArray.find(
    (chunk) =>
      chunk?.type === "output_json" ||
      chunk?.type === "json" ||
      typeof chunk?.json === "object"
  );

  if (jsonChunk?.json) {
    return normaliseQuote(jsonChunk.json as RawQuote);
  }

  const textChunk = contentArray.find(
    (chunk) => Array.isArray(chunk?.text) && chunk.text.length > 0
  );
  if (textChunk?.text?.[0]) {
    try {
      return normaliseQuote(JSON.parse(textChunk.text[0]) as RawQuote);
    } catch {
      throw new Error("OpenAI response text was not valid JSON.");
    }
  }

  if (primaryOutput?.content?.[0]?.json) {
    return normaliseQuote(primaryOutput.content[0].json as RawQuote);
  }

  throw new Error("Unable to parse quote data from OpenAI response.");
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  return fallback;
}

function normaliseQuote(raw: RawQuote): GeneratedQuote {
  const materials = Array.isArray(raw.materials)
    ? raw.materials.map((material) => ({
        item: String(material?.item ?? "Material"),
        quantity: Number(material?.quantity ?? 1),
        unit_cost: Number(material?.unit_cost ?? 0),
      }))
    : [];

  return {
    scope_of_work: safeString(raw.scope_of_work, "Scope not provided"),
    labor_hours_estimate: Number(raw.labor_hours_estimate ?? 0),
    materials,
    subtotal: Number(raw.subtotal ?? 0),
    tax: Number(raw.tax ?? 0),
    total: Number(raw.total ?? 0),
    client_message: safeString(
      raw.client_message,
      "Thanks for the opportunity! Please review and let me know if you have questions."
    ),
  };
}

/**
 * FUTURE ENHANCEMENT: media-aware quoting (do not implement yet).
 *
 * Goal: Given job media (e.g., photos) and the job description, generate a more accurate
 * scope of work or a nicer customer-facing description. This should plug into the quote
 * generation pipeline above without sending images today.
 *
 * Suggested integration point:
 * - Before building the prompt in generateQuoteForJob, fetch job media metadata/URLs.
 * - Pass a distilled summary of media (file names, captions, is_public flags) into the prompt.
 * - When/if image processing is allowed, add a separate step to derive structured details
 *   from images and feed those into the prompt.
 *
 * Explicitly do NOT send images to OpenAI or add image-processing code yet.
 */
export async function prepareMediaInsightsForQuote(_jobId: string) {
  // Placeholder: in the future, pull media rows for the job and derive a text summary
  // to enrich quote prompts. Keep this server-only and respect media.is_public if using
  // customer-visible flows.
  return null;
}
