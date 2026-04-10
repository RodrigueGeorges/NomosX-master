import ResearchersShowcase from '@/components/ResearchersShowcase';

export default function ResearchersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-indigo-300 font-medium text-sm">Phase 3 Expansion</span>
            </div>
            
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-tight">
              <span className="nx-gradient-text">22 PhD Researchers</span>
              <br />
              <span className="text-white/80">One Autonomous Council</span>
            </h1>
            
            <p className="text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
              The world's most comprehensive AI research council, spanning 22 specialized domains 
              from core economics to cutting-edge complexity science.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <div className="flex items-center gap-6 text-sm text-white/50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-400" />
                  <span>9 Core Domains</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-400" />
                  <span>6 Advanced</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <span>7 Specialized</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Researchers Showcase */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <ResearchersShowcase 
          tier="strategic" 
          showAll={true}
          autoPlay={true}
        />
      </div>

      {/* Stats Section */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">22</div>
              <div className="text-sm text-white/60">PhD Researchers</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">250M+</div>
              <div className="text-sm text-white/60">Academic Sources</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">95%+</div>
              <div className="text-sm text-white/60">Domain Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">24/7</div>
              <div className="text-sm text-white/60">Autonomous Operation</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
