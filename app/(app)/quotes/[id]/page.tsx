export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";

type QuoteRecord = {
  id: string;
  status: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  job_id: string | null;
  client_message_template: string | null;
  public_token: string | null;
};


export default async function QuoteDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quote-detail] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[quote-detail] Failed to get user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, status, total, subtotal, tax, created_at, updated_at, accepted_at, paid_at, job_id, client_message_template, public_token")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error || !quote) {
    console.error("[quote-detail] Quote lookup failed:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-2">
          <h1 className="hb-heading-1 text-2xl font-semibold">Quote not found</h1>
          <p className="hb-muted text-sm">
            We couldn’t load that quote. Please go back to the list.
          </p>
          <Link
            href="/quotes"
            className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
          >
            ← Back to quotes
          </Link>
        </HbCard>
      </div>
    );
  }

  const quoteRecord = quote as QuoteRecord;
  const displayStatus = quoteRecord.status ?? "draft";
  const createdDate =
    quoteRecord.created_at && !Number.isNaN(new Date(quoteRecord.created_at).getTime())
      ? new Date(quoteRecord.created_at).toLocaleString()
      : null;
  const updatedDate =
    quoteRecord.updated_at && !Number.isNaN(new Date(quoteRecord.updated_at).getTime())
      ? new Date(quoteRecord.updated_at).toLocaleString()
      : null;
  const acceptedDate =
    quoteRecord.accepted_at && !Number.isNaN(new Date(quoteRecord.accepted_at).getTime())
      ? new Date(quoteRecord.accepted_at).toLocaleString()
      : null;
  const paidDate =
    quoteRecord.paid_at && !Number.isNaN(new Date(quoteRecord.paid_at).getTime())
      ? new Date(quoteRecord.paid_at).toLocaleString()
      : null;
  const subtotalLabel =
    quoteRecord.subtotal != null ? formatCurrency(quoteRecord.subtotal) : "–";
  const taxLabel = quoteRecord.tax != null ? formatCurrency(quoteRecord.tax) : "–";
  const totalLabel =
    quoteRecord.total != null ? formatCurrency(quoteRecord.total) : "Not set";
  const publicUrl = quoteRecord.public_token
    ? `/public/quotes/${quoteRecord.public_token}`
    : null;

  const shortId = quoteRecord.id.slice(0, 8);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quote</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Quote {shortId}</h1>
          <p className="text-sm text-slate-400">Status: {displayStatus}</p>
        </div>
        <Link
          href="/quotes"
          className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
        >
          ← Back to quotes
        </Link>
      </header>
      <HbCard className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total</p>
          <p className="text-3xl font-semibold text-slate-100">{totalLabel}</p>
        </div>
        <div className="grid gap-2 text-sm text-slate-400 lg:grid-cols-3">
          <p>Status: {displayStatus}</p>
          {createdDate && <p>Created: {createdDate}</p>}
          {updatedDate && <p>Updated: {updatedDate}</p>}
        </div>
        <div className="grid gap-2 text-sm text-slate-400 lg:grid-cols-2">
          <p>Subtotal: {subtotalLabel}</p>
          <p>Tax: {taxLabel}</p>
        </div>
        {acceptedDate && (
          <p className="text-sm text-slate-400">Accepted: {acceptedDate}</p>
        )}
        {paidDate && <p className="text-sm text-slate-400">Paid: {paidDate}</p>}
        {quoteRecord.client_message_template && (
          <div className="text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer note</p>
            <p>{quoteRecord.client_message_template}</p>
          </div>
        )}
        {quoteRecord.job_id && (
          <p className="text-sm text-slate-400">Job: {quoteRecord.job_id}</p>
        )}
        {publicUrl && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer view</p>
            <Link
              href={publicUrl}
              className="text-sm font-semibold text-sky-300 hover:text-sky-200"
            >
              Open public quote
            </Link>
          </div>
        )}
      </HbCard>
    </div>
  );
}
