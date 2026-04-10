export default function SignalsLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-400 mx-auto mb-4" />
        <p className="text-white/50 text-sm">Loading signals…</p>
      </div>
    </div>
  );
}
