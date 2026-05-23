export default function Loading() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 border-2 border-accent/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-white/50 text-sm">Loading...</p>
      </div>
    </div>
  );
}
