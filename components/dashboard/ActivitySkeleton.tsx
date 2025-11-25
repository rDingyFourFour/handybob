export function ActivitySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-slate-700/80" />
            <div className="space-y-1">
              <span className="h-3 w-40 rounded-full bg-slate-700/80" />
              <span className="h-2 w-24 rounded-full bg-slate-700/80" />
            </div>
          </div>
          <span className="h-3 w-16 rounded-full bg-slate-700/80" />
        </div>
      ))}
    </div>
  );
}
