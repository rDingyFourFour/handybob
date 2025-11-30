export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type CustomerLink = {
  id: string | null;
  name: string | null;
};

type JobLink = {
  id: string | null;
  title: string | null;
  customers?: CustomerLink | CustomerLink[] | null;
};

type InvoiceRecord = {
  id: string;
  user_id: string;
  status: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total: number | null;
  created_at: string | null;
  due_at?: string | null;
  paid_at?: string | null;
  public_token?: string | null;
  updated_at?: string | null;
  job?: JobLink | JobLink[] | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function InvoiceDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoice-detail] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[invoice-detail] Failed to get user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      id,
      user_id,
      status,
      subtotal,
      tax,
      total,
      created_at,
      due_at,
      paid_at,
      public_token,
      updated_at,
      job:jobs (
        id,
        title,
        customers ( id, name )
      )
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    console.error("[invoice-detail] Invoice lookup failed:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Invoice not found</h1>
          <p className="hb-muted text-sm">We couldn’t find an invoice for that link.</p>
          <HbButton as="a" href="/invoices" size="sm">
            Back to invoices
          </HbButton>
        </HbCard>
      </div>
    );
  }

  const invoice = data as InvoiceRecord;
  const shortId = invoice.id.slice(0, 8);
  const createdDate = formatDate(invoice.created_at);
  const dueDate = formatDate(invoice.due_at);
  const paidDate = formatDate(invoice.paid_at);
  const subtotalLabel = invoice.subtotal != null ? formatCurrency(invoice.subtotal) : "—";
  const taxLabel = invoice.tax != null ? formatCurrency(invoice.tax) : "—";
  const totalLabel = invoice.total != null ? formatCurrency(invoice.total) : "Not set";
  const publicUrl = invoice.public_token ? `/public/invoices/${invoice.public_token}` : null;
  const rawJob = Array.isArray(invoice.job) ? invoice.job[0] ?? null : invoice.job ?? null;
  const customersRaw = rawJob?.customers;
  const customersArray = customersRaw
    ? Array.isArray(customersRaw)
      ? customersRaw
      : [customersRaw]
    : [];
  const customerNames = customersArray
    .map((customer) => customer?.name)
    .filter((name): name is string => Boolean(name));
  const customerLabel = customerNames.length > 0 ? customerNames.join(", ") : null;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoice details</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Invoice {shortId}</h1>
          <p className="text-sm text-slate-400">Status: {invoice.status ?? "unknown"}</p>
        </div>
        <HbButton as="a" href="/invoices" size="sm">
          Back to invoices
        </HbButton>
      </header>
      <HbCard className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total</p>
          <p className="text-3xl font-semibold text-slate-100">{totalLabel}</p>
        </div>
        <div className="grid gap-2 text-sm text-slate-400 lg:grid-cols-3">
          <p>Subtotal: {subtotalLabel}</p>
          <p>Tax: {taxLabel}</p>
          <p>Created: {createdDate}</p>
        </div>
        {customerLabel && (
          <p className="text-sm text-slate-400">Customer: {customerLabel}</p>
        )}
        {rawJob?.id && (
          <p className="text-sm text-slate-400">
            Job:{" "}
            <Link href={`/jobs/${rawJob.id}`} className="text-sky-300 hover:text-sky-200">
              {rawJob.title ?? rawJob.id.slice(0, 8)}
            </Link>
          </p>
        )}
        <div className="grid gap-2 text-sm text-slate-400">
          <p>Due: {dueDate}</p>
          <p>Paid: {paidDate}</p>
        </div>
        {publicUrl && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer view</p>
            <Link href={publicUrl} className="text-sm font-semibold text-sky-300 hover:text-sky-200">
              Open public invoice
            </Link>
          </div>
        )}
      </HbCard>
    </div>
  );
}
