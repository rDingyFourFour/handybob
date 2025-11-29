export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

function formatCustomerDate(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function CustomersPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[customers] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[customers] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[customers] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const workspaceName = workspace.name ?? "Workspace";

  let customers: CustomerRow[] = [];
  let customersError: Error | null = null;
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email, phone, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false, nulls: "last" })
      .limit(100);
    if (error) {
      customersError = error;
    } else {
      customers = (data ?? []) as CustomerRow[];
    }
  } catch (error) {
    customersError = error as Error;
    console.error("[customers] Failed to fetch customers:", error);
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customers</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">
            Customers in {workspaceName}
          </h1>
          <p className="hb-muted text-sm">
            Keep track of the people you serve so jobs, quotes, and calls have a clear home.
          </p>
        </div>
        <HbButton as={Link} href="/customers/new" size="sm">
          Add customer
        </HbButton>
      </header>

      {customersError ? (
        <HbCard className="space-y-2">
          <h2 className="hb-card-heading text-lg font-semibold">Unable to load customers</h2>
          <p className="hb-muted text-sm">
            Something went wrong while fetching your customers. Please try again shortly.
          </p>
        </HbCard>
      ) : customers.length === 0 ? (
        <HbCard className="space-y-4">
          <div className="space-y-2">
            <h2 className="hb-card-heading text-lg font-semibold">No customers yet</h2>
            <p className="hb-muted text-sm">
              Once you add a customer, it will appear here so you can connect them to jobs, quotes,
              and calls.
            </p>
          </div>
          <HbButton as={Link} href="/customers/new">
            Add your first customer
          </HbButton>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="hb-card-heading text-lg font-semibold">All customers</h2>
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Showing {customers.length} customer{customers.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-2">
            {customers.map((customer) => {
              const dateLabel = formatCustomerDate(customer.created_at);
              const contactDetails = [customer.email, customer.phone].filter(Boolean);
              return (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                  className="group block rounded-2xl px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100">
                        {customer.name ?? "Unnamed customer"}
                      </p>
                      {contactDetails.length > 0 && (
                        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                          {contactDetails.map((detail) => (
                            <span key={detail}>{detail}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      {dateLabel && (
                        <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                          Added {dateLabel}
                        </p>
                      )}
                      <span className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                        VIEW
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
