export default function ResearcherLoading() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10 sm:py-16">
      <div className="h-3 w-16 rounded bg-black/10 dark:bg-white/10 animate-pulse mb-10" />
      <div className="border border-black/[0.08] dark:border-white/[0.08] p-6 sm:p-10 mb-12 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8">
          <div className="w-20 h-20 sm:w-24 sm:h-24 border border-black/10 dark:border-white/10 flex-shrink-0" />
          <div className="flex-1">
            <div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10 mb-4" />
            <div className="h-8 w-64 rounded bg-black/10 dark:bg-white/10 mb-3" />
            <div className="h-4 w-48 rounded bg-black/10 dark:bg-white/10" />
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-10">
        {[0, 1].map(i => (
          <div key={i} className="space-y-3">
            <div className="h-3 w-24 rounded bg-black/10 dark:bg-white/10" />
            <div className="h-20 rounded bg-black/5 dark:bg-white/5" />
          </div>
        ))}
      </div>
    </main>
  );
}
