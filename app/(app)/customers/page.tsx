import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  updated_at: string | null;
  created_at: string | null;
};

const ERROR_MESSAGE = "Unable to load customers right now. Please try again.";

export default async function CustomersPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[customers] Failed to initialize Supabase client:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load customers</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[customers] Failed to resolve the user:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load customers</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect("/login");
  }

  let workspaceContext;
  try {
    workspaceContext = await getCurrentWorkspace({ supabase });
  } catch (error) {
    console.error("[customers] Failed to resolve workspace context:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load customers</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const { workspace } = workspaceContext;

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, updated_at, created_at")
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false, nulls: "last" })
    .order("created_at", { ascending: false, nulls: "last" })
    .limit(50);

  if (error) {
    console.error("[customers] failed to load customers", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load customers</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const customerList = (customers ?? []) as CustomerRow[];

  if (customerList.length === 0) {
    return (
      <div className="hb-shell pt-20 pb-8 space-y-4">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Customers</h1>
          <p className="text-sm text-slate-400">No customers found yet.</p>
        </header>
        <Link href="/customers/new" className="hb-button">
          Add a customer
        </Link>
      </div>
    );
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Customers</h1>
        <Link href="/customers/new" className="hb-button">
          New customer
        </Link>
      </header>
      <div className="space-y-3">
        {customerList.map((customer) => {
          const contactInfo = [customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact info";
          const updatedLabel = customer.updated_at ?? customer.created_at ?? "—";
          return (
            <div key={customer.id} className="hb-card space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="hb-card-heading">{customer.name || "Untitled customer"}</p>
                  <p className="text-xs text-slate-400">{contactInfo}</p>
                </div>
                <Link
                  href={`/customers/${customer.id}`}
                  className="text-sm font-medium text-sky-400 hover:text-sky-300"
                >
                  View
                </Link>
              </div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Updated {updatedLabel}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
