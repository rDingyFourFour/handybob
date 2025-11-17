export default function HomePage() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold mb-1">Today&apos;s appointments</h3>
        <p className="text-xs text-slate-400">
          Scheduling not set up yet. This will show jobs you&apos;re doing today.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold mb-1">New leads</h3>
        <p className="text-xs text-slate-400">
          Leads from web, phone, and manual entry will appear here.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold mb-1">Pending quotes</h3>
        <p className="text-xs text-slate-400">
          Quotes waiting on customer decisions will show here.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold mb-1">Unpaid invoices</h3>
        <p className="text-xs text-slate-400">
          Outstanding invoices and overdue payments will show here.
        </p>
      </div>
    </div>
  );
}