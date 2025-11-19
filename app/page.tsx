// app/page.tsx
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
  ] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("id")
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
    ]);

  const paidQuotes =
    (paidQuotesThisMonthRes.data ?? []) as { id: string; total: number | null }[];
  const paidQuotesCount = paidQuotes.length;
  const collectedThisMonth = paidQuotes.reduce(
    (sum, quote) => sum + Number(quote.total ?? 0),
    0
  );

  return (
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
    </div>
  );
}
