import Link from "next/link";
import { redirect } from "next/navigation";

import { generateQuoteForJob } from "@/utils/ai/generateQuote";
import { createServerClient } from "@/utils/supabase/server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const jobId = params?.id;
  if (typeof jobId !== "string" || !UUID_REGEX.test(jobId)) {
    redirect("/jobs");
  }
  if (!jobId) {
    redirect("/jobs");
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*, customers(*)")
    .eq("id", jobId)
    .single();

  if (jobError) throw new Error(jobError.message);
  if (!job) redirect("/jobs");

  const { data: quotes, error: quotesError } = await supabase
    .from("quotes")
    .select("id, status, total, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  const safeQuotes = quotes ?? [];

  return (
    <div className="space-y-6">
      <div className="hb-card space-y-2">
        <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
          Job
        </p>
        <h1 className="text-2xl font-semibold">
          {job.title || "Job details"}
        </h1>
        <p className="hb-muted">{job.description_raw || "No description."}</p>

        <div className="text-xs text-slate-400">
          Customer: {job.customers?.name || "Unknown"}
        </div>
        <div className="text-xs text-slate-400">Status: {job.status}</div>
        <div className="text-xs text-slate-400">
          Urgency: {job.urgency ?? "not set"}
        </div>
      </div>

      <div className="hb-card space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quotes</h2>
            <p className="hb-muted text-sm">
              Generate a quote with AI or review existing drafts.
            </p>
          </div>
          <form action={generateQuoteForJob} className="flex items-center gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <button className="hb-button">
              {safeQuotes.length ? "Generate new quote" : "Generate quote with AI"}
            </button>
          </form>
        </div>

        {quotesError ? (
          <p className="text-sm text-red-400">
            Failed to load quotes: {quotesError.message}
          </p>
        ) : safeQuotes.length ? (
          <div className="space-y-2">
            {safeQuotes.map((quote) => (
              <div
                key={quote.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    Quote #{quote.id.slice(0, 8)} · {quote.status}
                  </p>
                  <p className="text-xs text-slate-400">
                    Created{" "}
                    {quote.created_at
                      ? new Date(quote.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">
                    $
                    {Number(quote.total ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <Link href={`/quotes/${quote.id}`} className="hb-button">
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="hb-muted text-sm">
            No quotes yet. Generate your first AI quote above.
          </p>
        )}
      </div>
    </div>
  );
}
