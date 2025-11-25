import Link from "next/link";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import CustomerListRow from "./components/CustomerListRow";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

export default async function CustomersPage() {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const safeCustomers = (customers ?? []) as CustomerRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Customers</h1>
          <p className="hb-muted">
            Track everyone you communicate with and scope messages, jobs, and invoices accordingly.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="hb-button text-sm"
        >
          Add customer
        </Link>
      </div>

      <div className="hb-card">
        {error && (
          <p className="text-sm text-rose-400">Failed to load customers: {error.message}</p>
        )}

        {!safeCustomers.length ? (
          <p className="hb-muted text-sm">
            No customers yet. Add someone to start logging jobs and calls.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Name</th>
                  <th className="pb-2 hidden md:table-cell">Email</th>
                  <th className="pb-2 hidden md:table-cell">Phone</th>
                  <th className="pb-2 text-right">Since</th>
                </tr>
              </thead>
              <tbody>
                {safeCustomers.map((customer) => (
                  <CustomerListRow key={customer.id} customer={customer} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
