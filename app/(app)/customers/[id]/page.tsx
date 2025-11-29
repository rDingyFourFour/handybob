export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type CustomerRecord = {
  id: string;
  workspace_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/customers" size="sm">
          Back to customers
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  if (!id || !id.trim() || id === "new") {
    redirect("/customers/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[customer-detail] Failed to init Supabase client", error);
    return fallbackCard("Customer unavailable", "Could not connect to Supabase. Please try again.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[customer-detail] Failed to resolve workspace", error);
    return fallbackCard("Customer unavailable", "Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    return fallbackCard("Customer unavailable", "Unable to resolve workspace. Please try again.");
  }

  let customer: CustomerRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<CustomerRecord>("customers")
      .select("id, name, email, phone, created_at")
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[customer-detail] Customer lookup failed", error);
      return fallbackCard("Customer not found", "We couldn’t find that customer. It may have been deleted.");
    }

    customer = data ?? null;
  } catch (error) {
    console.error("[customer-detail] Customer query error", error);
    return fallbackCard("Customer not found", "We couldn’t find that customer. It may have been deleted.");
  }

  if (!customer) {
    return fallbackCard("Customer not found", "We couldn’t find that customer. It may have been deleted.");
  }

  const displayName = customer.name ?? "Unnamed customer";
  const contactLine = [customer.email, customer.phone].filter(Boolean).join(" · ");
  const createdLabel = formatDate(customer.created_at);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">{displayName}</h1>
            {contactLine && <p className="text-sm text-slate-400">{contactLine}</p>}
            {createdLabel && (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Created {createdLabel}</p>
            )}
          </div>
          <div className="flex gap-2">
            <HbButton as="a" href="/customers" variant="ghost" size="sm">
              Back to customers
            </HbButton>
            <HbButton as="a" href={`/jobs/new?customer_id=${customer.id}`} variant="secondary" size="sm">
              New job
            </HbButton>
          </div>
        </header>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>
            <span className="font-semibold">Name:</span> {customer.name ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Email:</span> {customer.email ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Phone:</span> {customer.phone ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Created:</span> {createdLabel ?? "—"}
          </p>
        </div>
        <div className="space-y-3 text-sm text-slate-400">
          <Link href={`/jobs?customer_id=${customer.id}`} className="text-sky-300 hover:text-sky-200">
            View jobs for this customer
          </Link>
        </div>
      </HbCard>
    </div>
  );
}
