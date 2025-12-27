export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import QuoteFormShell from "./QuoteFormShell";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    jobId?: string;
    description?: string;
    source?: string;
  } | null>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quotes/new] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[quotes/new] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[quotes/new] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const hasJobIdError = resolvedSearchParams.error === "job_id_required";
  const jobIdPrefill = resolvedSearchParams.jobId ?? "";
  const sourceFromQuery =
    typeof resolvedSearchParams.source === "string" ? resolvedSearchParams.source : undefined;
  const jobIdFromQuery =
    typeof resolvedSearchParams.jobId === "string" ? resolvedSearchParams.jobId : undefined;
  const descriptionFromQuery =
    typeof resolvedSearchParams.description === "string"
      ? resolvedSearchParams.description
      : undefined;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quotes</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Create a quote</h1>
          <p className="hb-muted text-sm">
            Estimate the work so you can send a clear proposal to your customer.
          </p>
        </div>
        <Link
          href="/quotes"
          className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
        >
          ← Back to quotes
        </Link>
      </header>
      <QuoteFormShell
        jobIdPrefill={jobIdPrefill}
        hasJobIdError={hasJobIdError}
        sourceFromQuery={sourceFromQuery}
        jobIdFromQuery={jobIdFromQuery}
        descriptionFromQuery={descriptionFromQuery}
      />
    </div>
  );
}
