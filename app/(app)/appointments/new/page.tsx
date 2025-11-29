import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

export default function AppointmentsNewPage() {
  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointments</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Create an appointment</h1>
        <p className="hb-muted text-sm">
          This is a placeholder; appointment creation will be implemented later.
        </p>
      </header>
      <HbCard className="space-y-4">
        <p className="text-sm text-slate-400">Title: _____________</p>
        <p className="text-sm text-slate-400">Start time: _____________</p>
        <p className="text-sm text-slate-400">Notes: _____________</p>
        <HbButton as={Link} href="/appointments" size="sm">
          Back to appointments
        </HbButton>
      </HbCard>
    </div>
  );
}
