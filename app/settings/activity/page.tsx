// app/settings/activity/page.tsx
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/utils/workspaces";

type AuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  actors?: { email?: string | null } | { email?: string | null }[];
};

function describeEntry(entry: AuditRow): string {
  const action = (entry.action || "").toLowerCase();
  const entityType = (entry.entity_type || "").toLowerCase();
  const meta = entry.metadata || {};

  const amount = typeof meta.amount === "number" ? meta.amount : typeof meta.total === "number" ? meta.total : null;
  const currency = (meta.currency as string | null) || "USD";
  const formattedAmount = amount !== null ? `$${amount.toFixed(2)} ${currency}` : null;

  if (action === "quote_sent") {
    return `Quote ${entry.entity_id || ""} sent${formattedAmount ? ` (${formattedAmount})` : ""}`;
  }
  if (action === "quote_paid") {
    return `Quote ${entry.entity_id || ""} marked paid${formattedAmount ? ` (${formattedAmount})` : ""}`;
  }
  if (action === "quote_created") {
    return `Quote ${entry.entity_id || ""} created`;
  }
  if (action === "quote_accepted") {
    return `Quote ${entry.entity_id || ""} accepted`;
  }
  if (action === "invoice_sent") {
    return `Invoice ${entry.entity_id || ""} sent${formattedAmount ? ` (${formattedAmount})` : ""}`;
  }
  if (action === "invoice_paid") {
    return `Invoice ${entry.entity_id || ""} marked paid${formattedAmount ? ` (${formattedAmount})` : ""}`;
  }
  if (action === "invoice_created") {
    return `Invoice ${entry.entity_id || ""} created${formattedAmount ? ` (${formattedAmount})` : ""}`;
  }
  if (action === "job_created") {
    const source = meta.source as string | undefined;
    return `Job ${entry.entity_id || ""} created${source ? ` via ${source.replace("_", " ")}` : ""}`;
  }
  if (action === "settings_updated") {
    return `${entityType.replace("_", " ")} updated`;
  }
  return `${action || "activity"} on ${entityType || "item"}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function filterParams(searchParams?: Record<string, string | string[] | undefined>) {
  const type = searchParams?.type;
  const from = searchParams?.from;
  const to = searchParams?.to;
  return {
    type: Array.isArray(type) ? type[0] : type || null,
    from: Array.isArray(from) ? from[0] : from || null,
    to: Array.isArray(to) ? to[0] : to || null,
  };
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);
  const { workspace } = workspaceContext;

  const filters = await filterParams(searchParams);

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, actor_user_id, action, entity_type, entity_id, metadata, actors:auth.users(email)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.type === "quotes") {
    query = query.in("action", ["quote_created", "quote_sent", "quote_accepted", "quote_paid"]);
  } else if (filters.type === "invoices") {
    query = query.in("action", ["invoice_created", "invoice_sent", "invoice_paid"]);
  } else if (filters.type === "settings") {
    query = query.eq("action", "settings_updated");
  }

  if (filters.from) {
    query = query.gte("created_at", filters.from);
  }
  if (filters.to) {
    query = query.lte("created_at", filters.to);
  }

  const { data: entries, error } = await query.returns<AuditRow[]>();

  const rows: AuditRow[] = entries ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h1>Activity</h1>
        <p className="hb-muted text-sm">Workspace-wide audit log. Owners only. Most recent first.</p>
        <p className="text-[11px] uppercase text-slate-500">
          Workspace settings for {workspace.name || "Workspace"}
        </p>
      </div>

      <form className="hb-card grid gap-3 md:grid-cols-4 text-sm" method="get">
        <div>
          <label className="hb-label text-xs" htmlFor="type">Type</label>
          <select id="type" name="type" className="hb-input" defaultValue={filters.type || "all"}>
            <option value="all">All</option>
            <option value="quotes">Quotes</option>
            <option value="invoices">Invoices</option>
            <option value="settings">Settings</option>
          </select>
        </div>
        <div>
          <label className="hb-label text-xs" htmlFor="from">From</label>
          <input id="from" name="from" type="date" className="hb-input" defaultValue={filters.from ?? ""} />
        </div>
        <div>
          <label className="hb-label text-xs" htmlFor="to">To</label>
          <input id="to" name="to" type="date" className="hb-input" defaultValue={filters.to ?? ""} />
        </div>
        <div className="flex items-end">
          <button className="hb-button text-sm" type="submit">Filter</button>
        </div>
      </form>

      <div className="hb-card divide-y divide-slate-800">
        {error && (
          <div className="p-3 text-sm text-red-300">Failed to load activity: {error.message}</div>
        )}
        {!rows.length && !error ? (
          <div className="p-3 text-sm text-slate-400">No activity yet.</div>
        ) : null}
        {rows.map((entry) => {
          const actorEmail = Array.isArray(entry.actors)
            ? (entry.actors[0] as { email?: string | null } | undefined)?.email
            : (entry.actors as { email?: string | null } | undefined)?.email;
          const actorLabel = actorEmail || (entry.actor_user_id ? entry.actor_user_id.slice(0, 6) : "System");
          return (
            <div key={entry.id} className="p-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold">{describeEntry(entry)}</div>
                <div className="text-xs text-slate-400">
                  Actor: {actorLabel}
                </div>
              </div>
              <div className="text-xs text-slate-500">{formatTimestamp(entry.created_at)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
