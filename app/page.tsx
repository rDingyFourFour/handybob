import { redirect } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";

export default async function HomePage() {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // TODO: later, fetch real data for this user
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="hb-card">
        <h3>Today&apos;s appointments</h3>
        <p className="hb-muted">
          Scheduling not set up yet. This will show jobs you&apos;re doing today.
        </p>
      </div>

      <div className="hb-card">
        <h3>New leads</h3>
        <p className="hb-muted">
          Leads from web, phone, and manual entry will appear here.
        </p>
      </div>

      <div className="hb-card">
        <h3>Pending quotes</h3>
        <p className="hb-muted">
          Quotes waiting on customer decisions will show here.
        </p>
      </div>

      <div className="hb-card">
        <h3>Unpaid invoices</h3>
        <p className="hb-muted">
          Outstanding invoices and overdue payments will show here.
        </p>
      </div>
    </div>
  );
}