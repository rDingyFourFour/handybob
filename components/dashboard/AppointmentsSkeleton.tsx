export type AppointmentsSkeletonProps = {
  rows?: number;
};

export function AppointmentsSkeleton({ rows = 3 }: AppointmentsSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded border border-slate-800/70 bg-slate-900/60 px-3 py-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="h-4 w-36 rounded-full bg-slate-700/80" />
            <span className="h-3 w-20 rounded-full bg-slate-700/80" />
          </div>
          <div className="mt-2 h-3 w-48 rounded-full bg-slate-700/80" />
          <div className="mt-1 h-3 w-32 rounded-full bg-slate-700/80" />
        </div>
      ))}
    </div>
  );
}
