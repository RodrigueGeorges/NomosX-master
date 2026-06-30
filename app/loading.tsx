export default function Loading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 border-2 border-white/15" />
        <div className="absolute inset-0 border-2 border-white border-t-transparent animate-spin" />
      </div>
    </div>
  );
}
