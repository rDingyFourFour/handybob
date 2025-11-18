import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type MaterialLine = {
  item: string;
  quantity: number;
  unit_cost: number;
};

type QuoteLineItem = {
  scope?: string;
  hours?: number;
  materials?: MaterialLine[];
};

type QuoteRecord = {
  id: string;
  job_id: string;
  status: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: QuoteLineItem[] | null;
  client_message_template: string | null;
  job: {
    title: string | null;
  } | null;
  customer: {
    name: string | null;
  } | null;
};

export default async function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, job_id, status, subtotal, tax, total, line_items, client_message_template, job:jobs(title), customer:customers(name)"
    )
    .eq("id", params.id)
    .single<QuoteRecord>();

  if (error) throw new Error(error.message);
  if (!quote) notFound();

  const lineItems: QuoteLineItem[] = Array.isArray(quote.line_items)
    ? quote.line_items
    : [];
  const primaryLine = lineItems[0];
  const materials: MaterialLine[] = Array.isArray(primaryLine?.materials)
    ? primaryLine.materials
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            Quote ID
          </p>
          <h1 className="text-2xl font-semibold">Quote #{quote.id}</h1>
          <p className="hb-muted text-sm">
            For {quote.customer?.name || "Unknown customer"} · Job:{" "}
            <Link
              href={`/jobs/${quote.job_id}`}
              className="text-blue-400 hover:underline"
            >
              {quote.job?.title || "View job"}
            </Link>
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
          {quote.status}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="hb-card space-y-3">
          <h2 className="text-lg font-semibold">Scope of work</h2>
          <p className="text-sm whitespace-pre-wrap">
            {primaryLine?.scope || "Scope not provided."}
          </p>
          <div className="text-xs text-slate-400">
            Labor hours estimate: {primaryLine?.hours ?? "n/a"}
          </div>
        </div>

        <div className="hb-card space-y-2">
          <h2 className="text-lg font-semibold">Totals</h2>
          <p>Subtotal: ${Number(quote.subtotal ?? 0).toFixed(2)}</p>
          <p>Tax: ${Number(quote.tax ?? 0).toFixed(2)}</p>
          <p className="text-xl font-semibold">
            Total: ${Number(quote.total ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="hb-card space-y-3">
        <h2 className="text-lg font-semibold">Materials</h2>
        {materials.length ? (
          <ul className="space-y-2 text-sm">
            {materials.map((material, index) => (
              <li
                key={`${material.item}-${index}`}
                className="flex items-center justify-between"
              >
                <span>
                  {material.item} · qty {material.quantity}
                </span>
                <span>${Number(material.unit_cost ?? 0).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hb-muted text-sm">No materials listed.</p>
        )}
      </div>

      <div className="hb-card space-y-2">
        <h2 className="text-lg font-semibold">Client message</h2>
        <p className="text-sm whitespace-pre-wrap">
          {quote.client_message_template}
        </p>
      </div>

      <div className="flex justify-end">
        <button className="hb-button opacity-60" disabled>
          Send quote (coming soon)
        </button>
      </div>
    </div>
  );
}
