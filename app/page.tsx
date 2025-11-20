// app/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";

export default async function HomePage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const monthStart = new Date(todayStart);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(monthStart.getMonth() + 1);

  const [
    appointmentsRes,
    leadsRes,
    pendingQuotesRes,
    unpaidInvoicesRes,
    paidQuotesThisMonthRes,
    paidInvoicesThisMonthRes,
  ] =
    await Promise.all([
      supabase
        .from("appointments")
        .select(
          `
            id,
            title,
            start_time,
            jobs ( title )
          `
        )
        .gte("start_time", todayStart.toISOString())
        .lte("start_time", todayEnd.toISOString()),

      supabase.from("jobs").select("id").eq("status", "lead"),

      supabase.from("quotes").select("id").eq("status", "sent"),

      supabase
        .from("invoices")
        .select("id")
        .in("status", ["sent", "overdue"]),

      supabase
        .from("quotes")
        .select("id, total, paid_at")
        .eq("status", "paid")
        .gte("paid_at", monthStart.toISOString())
        .lt("paid_at", nextMonthStart.toISOString()),

      supabase
        .from("invoices")
        .select("id, total, paid_at")
        .eq("status", "paid")
        .gte("paid_at", monthStart.toISOString())
        .lt("paid_at", nextMonthStart.toISOString()),
    ]);

  const paidQuotes =
    (paidQuotesThisMonthRes.data ?? []) as { id: string; total: number | null }[];
  const paidQuotesCount = paidQuotes.length;
  const collectedThisMonth = paidQuotes.reduce(
    (sum, quote) => sum + Number(quote.total ?? 0),
    0
  );

  const paidInvoices =
    (paidInvoicesThisMonthRes.data ?? []) as { id: string; total: number | null }[];
  const paidInvoicesCount = paidInvoices.length;
  const collectedInvoicesThisMonth = paidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total ?? 0),
    0
  );

  const todaysAppointments = (appointmentsRes.data ?? []) as {
    id: string;
    title: string | null;
    start_time: string | null;
    jobs:
      | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }
      | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }[]
      | null;
  }[];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="hb-card">
        <h3>Today&apos;s appointments</h3>
        <p className="text-2xl font-semibold">
          {appointmentsRes.data?.length ?? 0}
        </p>
      </div>

      <div className="hb-card">
        <h3>New leads</h3>
        <p className="text-2xl font-semibold">
          {leadsRes.data?.length ?? 0}
        </p>
      </div>

      <div className="hb-card">
        <h3>Pending quotes</h3>
        <p className="text-2xl font-semibold">
          {pendingQuotesRes.data?.length ?? 0}
        </p>
      </div>

      <div className="hb-card">
        <h3>Unpaid invoices</h3>
        <p className="text-2xl font-semibold">
          {unpaidInvoicesRes.data?.length ?? 0}
        </p>
      </div>

      <div className="hb-card">
        <h3>Paid quotes this month</h3>
        <p className="text-2xl font-semibold">
          {paidQuotesCount}
        </p>
      </div>

      <div className="hb-card">
        <h3>Collected this month</h3>
        <p className="text-2xl font-semibold">
          ${collectedThisMonth.toFixed(2)}
        </p>
      </div>

      <div className="hb-card">
        <h3>Invoices paid this month</h3>
        <p className="text-2xl font-semibold">
          {paidInvoicesCount}
        </p>
      </div>

      <div className="hb-card">
        <h3>Revenue collected this month</h3>
        <p className="text-2xl font-semibold">
          ${(collectedThisMonth + collectedInvoicesThisMonth).toFixed(2)}
        </p>
      </div>
      </div>

      <div className="hb-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3>Today&apos;s appointments</h3>
            <p className="hb-muted text-sm">Quick view of your day.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <Link href="/appointments" className="hb-button-ghost">
              View all
            </Link>
            <Link href="/calendar" className="hb-button-ghost">
              Calendar
            </Link>
          </div>
        </div>

        {todaysAppointments.length === 0 ? (
          <p className="hb-muted text-sm">No appointments scheduled for today.</p>
        ) : (
          <div className="space-y-2">
            {todaysAppointments.slice(0, 3).map((appt) => {
              const start = appt.start_time
                ? new Date(appt.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
              const job = Array.isArray(appt.jobs) ? appt.jobs[0] ?? null : appt.jobs;
              const jobTitle = job?.title || "No job linked";
              const customer = Array.isArray(job?.customers) ? job?.customers[0] : job?.customers;

              return (
                <div key={appt.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{appt.title || "Appointment"}</span>
                    <span className="hb-muted text-xs">{start}</span>
                  </div>
                  <p className="hb-muted text-xs">{jobTitle}</p>
                  <p className="hb-muted text-[11px]">
                    {customer?.name ? `Customer: ${customer.name}` : "Customer: Unknown"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
