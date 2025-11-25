export function MessagesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded border border-slate-800 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="h-4 w-40 rounded-full bg-slate-700/80" />
            <span className="h-3 w-24 rounded-full bg-slate-700/80" />
          </div>
          <div className="mt-2 h-3 w-48 rounded-full bg-slate-700/80" />
          <div className="mt-1 h-3 w-28 rounded-full bg-slate-700/80" />
        </div>
      ))}
    </div>
  );
}
