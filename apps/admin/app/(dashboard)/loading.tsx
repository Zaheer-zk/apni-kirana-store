// Generic dashboard route fallback. Next.js automatically renders this while
// the actual route segment is being compiled / fetched, so users see structure
// immediately instead of a blank gap.

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Page title placeholder */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded shimmer" />
        <div className="h-4 w-72 rounded shimmer" />
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-2 p-5">
            <div className="h-3 w-20 rounded shimmer" />
            <div className="h-7 w-28 rounded shimmer" />
            <div className="h-3 w-32 rounded shimmer" />
          </div>
        ))}
      </div>

      {/* Main content block */}
      <div className="card space-y-3 p-6">
        <div className="h-5 w-40 rounded shimmer" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full shimmer" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-2/5 rounded shimmer" />
              <div className="h-3 w-3/5 rounded shimmer" />
            </div>
            <div className="h-7 w-20 rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
