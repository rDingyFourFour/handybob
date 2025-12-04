export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

const LIST_GRID_CLASSES =
  "md:grid-cols-[minmax(0,2fr)_minmax(0,160px)_minmax(0,220px)_minmax(0,220px)_minmax(0,170px)]";

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

function normalizeSearchQuery(value: string) {
  return value.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildSearchPattern(normalized: string) {
  return normalized ? `%${normalized}%` : null;
}

type ActivityKind = "job" | "quote" | "call" | "message";

const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  job: "Job",
  quote: "Quote",
  call: "Call",
  message: "Message",
};

type ActivityResponse = {
  customer_id: string | null;
  last_activity_at: string | null;
  last_activity_kind: ActivityKind | null;
};

type ActivityEntry = {
  kind: ActivityKind;
  timestamp: string;
};

function formatActivityLabel(activity?: ActivityEntry | null) {
  if (!activity) {
    return null;
  }
  const formattedDate = formatCustomerDate(activity.timestamp);
  if (!formattedDate) {
    return null;
  }
  return `${ACTIVITY_LABELS[activity.kind]} · ${formattedDate}`;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const searchParamsPromise = searchParams;
  const resolvedSearchParams = await searchParamsPromise;
  const searchQueryRaw = resolvedSearchParams?.q ?? "";
  const trimmedSearchQuery = searchQueryRaw.trim();
  const normalizedSearchQuery = normalizeSearchQuery(trimmedSearchQuery);
  const searchPattern = buildSearchPattern(normalizedSearchQuery);
  const hasSearch = Boolean(normalizedSearchQuery);

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
    const customersBuilder = supabase
      .from<CustomerRow>("customers")
      .select("id, name, email, phone, created_at")
      .eq("workspace_id", workspace.id);

    if (searchPattern) {
      customersBuilder.or(
        `name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`
      );
    }

    const { data, error } = await customersBuilder
      .order("name", { ascending: true, nulls: "last" })
      .limit(150);

    if (error) {
      customersError = error;
    } else {
      customers = (data ?? []) as CustomerRow[];
    }
  } catch (error) {
    customersError = error as Error;
    console.error("[customers] Failed to fetch customers:", error);
  }

  const activityMap: Record<string, ActivityEntry> = {};
  const customerIds = customers.map((customer) => customer.id);

  if (customerIds.length > 0) {
    try {
      const { data: activityRows, error: activityError } = await supabase
        .from<ActivityResponse>("customer_activity_summary")
        .select("customer_id, last_activity_at, last_activity_kind")
        .eq("workspace_id", workspace.id)
        .in("customer_id", customerIds);

      if (activityError) {
        console.error("[customers] Failed to load activity summary:", activityError);
      } else if (activityRows) {
        for (const row of activityRows) {
          if (!row.customer_id || !row.last_activity_at || !row.last_activity_kind) {
            continue;
          }
          activityMap[row.customer_id] = {
            kind: row.last_activity_kind,
            timestamp: row.last_activity_at,
          };
        }
      }
    } catch (error) {
      console.error("[customers] Failed to load activity summary:", error);
    }
  }

  const totalCustomers = customers.length;
  const hasCreatedAtField = customers.some((customer) => customer.created_at !== undefined);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCustomersCount =
    hasCreatedAtField && totalCustomers > 0
      ? customers.reduce((count, customer) => {
          if (!customer.created_at) {
            return count;
          }
          const createdDate = new Date(customer.created_at);
          if (Number.isNaN(createdDate.getTime())) {
            return count;
          }
          return createdDate >= sevenDaysAgo ? count + 1 : count;
        }, 0)
      : null;
  const isSearching = trimmedSearchQuery.length > 0;

  const resultCountLabel = `${totalCustomers} customer${totalCustomers === 1 ? "" : "s"}`;
  const resultsLabel = hasSearch
    ? `Showing ${resultCountLabel} for "${trimmedSearchQuery}".`
    : `Showing ${resultCountLabel}.`;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customers</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Customers</h1>
          <p className="hb-muted text-sm">
            This list shows contact info, when someone was added, and their latest job, quote, call, or message.
          </p>
          <p className="hb-muted text-sm">Showing customers for {workspaceName}.</p>
        </div>
        <HbButton as={Link} href="/customers/new" size="sm">
          New customer
        </HbButton>
      </header>

      {customersError ? (
        <HbCard className="space-y-2">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">All customers</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{resultsLabel}</p>
          </div>
          {totalCustomers > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
              <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">At a glance</span>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200">
                  Total customers: {totalCustomers}
                </span>
                {recentCustomersCount && recentCustomersCount > 0 && (
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200">
                    Added in last 7 days: {recentCustomersCount}
                  </span>
                )}
              </div>
            </div>
          )}
          <form action="/customers" method="get" className="flex flex-wrap items-center gap-2">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <input
              id="customer-search"
              name="q"
              defaultValue={trimmedSearchQuery}
              placeholder="Search name, email, or phone"
              className="flex-1 min-w-0 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              autoComplete="off"
            />
            <button type="submit" className="hb-button px-3 py-1 text-sm">
              Search
            </button>
          </form>
          {customers.length === 0 ? (
            isSearching ? (
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
                <div className="space-y-2">
                  <h2 className="hb-card-heading text-lg font-semibold text-slate-100">
                    {`No customers found for '${trimmedSearchQuery}'`}
                  </h2>
                  <p className="text-sm text-slate-400">
                    Try a different name, phone, or email.{" "}
                    <Link
                      href="/customers"
                      className="text-amber-400 underline-offset-2 hover:underline"
                    >
                      Clear search and view all customers
                    </Link>
                    .
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <HbButton as={Link} href="/customers/new" variant="ghost" size="sm">
                    Add as new customer
                  </HbButton>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
                <div className="space-y-2">
                  <h2 className="hb-card-heading text-lg font-semibold text-slate-100">No customers yet</h2>
                  <p>Add your first customer to start tracking jobs, calls, and invoices for them.</p>
                  <p className="text-xs text-slate-500">You can also create customers from jobs later.</p>
                </div>
                <HbButton as={Link} href="/customers/new">
                  Add customer
                </HbButton>
              </div>
            )
          ) : (
            <div className="space-y-1 rounded-2xl border border-slate-800 bg-slate-900/50">
              <div
                className={`grid items-center text-[10px] uppercase tracking-[0.3em] text-slate-500 px-4 py-2 ${LIST_GRID_CLASSES}`}
              >
                <div>Name</div>
                <div>Phone</div>
                <div>Email</div>
                <div>Last activity</div>
                <div className="text-right">Added</div>
              </div>
              <div className="divide-y divide-slate-800">
                {customers.map((customer) => {
                  const displayName = customer.name ?? "Unnamed customer";
                  const lastActivityLabel = formatActivityLabel(activityMap[customer.id]);
                  const createdLabel = formatCustomerDate(customer.created_at) ?? "—";
                  return (
                    <Link
                      key={customer.id}
                      href={`/customers/${customer.id}`}
                      className="group block rounded-2xl bg-slate-950/60 transition hover:bg-slate-900"
                    >
                      <div className={`grid items-center gap-3 px-4 py-3 text-sm text-slate-300 ${LIST_GRID_CLASSES}`}>
                        <div>
                          <p className="text-base font-semibold text-slate-100">{displayName}</p>
                        </div>
                        <div className="text-slate-100">{customer.phone ?? "—"}</div>
                        <div className="text-slate-100">{customer.email ?? "—"}</div>
                        <div className="text-slate-100">{lastActivityLabel ?? "No activity yet"}</div>
                        <div className="text-right text-slate-100">{createdLabel}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </HbCard>
      )}
    </div>
  );
}
