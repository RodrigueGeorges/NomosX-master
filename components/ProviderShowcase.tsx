"use client";
import React from 'react';
import { useEffect,useRef,useState } from 'react';


interface Provider {
  id: string;
  name: string;
  category: "academic" | "institutional" | "thinktank";
  abbreviation?: string;
}

const PROVIDERS: Provider[] = [
  // Academic (8)
  { id: "openalex", name: "OpenAlex", category: "academic" },
  { id: "semanticscholar", name: "Semantic Scholar", category: "academic", abbreviation: "S2" },
  { id: "crossref", name: "Crossref", category: "academic" },
  { id: "pubmed", name: "PubMed", category: "academic", abbreviation: "NCBI" },
  { id: "arxiv", name: "arXiv", category: "academic", abbreviation: "arXiv" },
  { id: "hal", name: "HAL", category: "academic", abbreviation: "HAL" },
  { id: "thesesfr", name: "theses.fr", category: "academic", abbreviation: "theses.fr" },
  { id: "base", name: "BASE", category: "academic", abbreviation: "BASE" },
  
  // Institutional (15)
  { id: "worldbank", name: "World Bank", category: "institutional", abbreviation: "WB" },
  { id: "imf", name: "IMF", category: "institutional" },
  { id: "oecd", name: "OECD", category: "institutional" },
  { id: "nato", name: "NATO", category: "institutional" },
  { id: "un", name: "United Nations", category: "institutional", abbreviation: "UN" },
  { id: "odni", name: "ODNI", category: "institutional" },
  { id: "nist", name: "NIST", category: "institutional" },
  { id: "cisa", name: "CISA", category: "institutional" },
  { id: "enisa", name: "ENISA", category: "institutional" },
  { id: "sgdsn", name: "SGDSN", category: "institutional" },
  { id: "eeas", name: "EEAS", category: "institutional" },
  { id: "bis", name: "BIS", category: "institutional" },
  { id: "undp", name: "UNDP", category: "institutional" },
  { id: "unctad", name: "UNCTAD", category: "institutional" },
  { id: "nsa", name: "NSA", category: "institutional" },
  
  // Think Tanks (18)
  { id: "brookings", name: "Brookings", category: "thinktank", abbreviation: "Brookings" },
  { id: "rand", name: "RAND", category: "thinktank" },
  { id: "cset", name: "CSET", category: "thinktank" },
  { id: "govai", name: "GovAI", category: "thinktank" },
  { id: "cnas", name: "CNAS", category: "thinktank" },
  { id: "newamerica", name: "New America", category: "thinktank", abbreviation: "New America" },
  { id: "ainow", name: "AI Now Institute", category: "thinktank", abbreviation: "AI Now" },
  { id: "datasociety", name: "Data & Society", category: "thinktank", abbreviation: "DataSoc" },
  { id: "cdt", name: "CDT", category: "thinktank" },
  { id: "iaps", name: "IAPS", category: "thinktank" },
  { id: "scsp", name: "SCSP", category: "thinktank" },
  { id: "rstreet", name: "R Street", category: "thinktank", abbreviation: "RStreet" },
  { id: "lawzero", name: "LawZero", category: "thinktank" },
  { id: "caip", name: "CAIP", category: "thinktank" },
  { id: "aipi", name: "AIPI", category: "thinktank" },
  { id: "caidp", name: "CAIDP", category: "thinktank" },
  { id: "ifp", name: "IFP", category: "thinktank" },
  { id: "abundance", name: "Abundance", category: "thinktank", abbreviation: "Abundance" },
];

const categoryColors = {
  academic: {
    bg: "from-slate-800/20 to-slate-700/20",
    border: "border-slate-600/30 hover:border-slate-500/50",
    text: "text-slate-300",
    accent: "text-slate-100"
  },
  institutional: {
    bg: "from-blue-900/20 to-blue-800/20",
    border: "border-blue-600/30 hover:border-blue-500/50",
    text: "text-blue-300",
    accent: "text-blue-100"
  },
  thinktank: {
    bg: "from-purple-900/20 to-purple-800/20",
    border: "border-purple-600/30 hover:border-purple-500/50",
    text: "text-purple-300",
    accent: "text-purple-100"
  }
};

export default function ProviderShowcase() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationFrameId: number;
    let scrollPosition = 0;
    const scrollSpeed = 0.5;

    const animate = () => {
      scrollPosition += scrollSpeed;
      
      const maxScroll = scrollContainer.scrollWidth / 2;
      if (scrollPosition >= maxScroll) {
        scrollPosition = 0;
      }
      
      scrollContainer.scrollLeft = scrollPosition;
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  const duplicatedProviders = [...PROVIDERS, ...PROVIDERS];

  return (
    <div className="w-full py-16 overflow-hidden bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
        <div className="text-center">
          <p className="text-xs text-indigo-400/60 tracking-[0.25em] uppercase mb-3 font-medium">
            Trusted Sources
          </p>
          <h3 className="text-2xl sm:text-3xl font-light text-white/90 mb-2">
            Built on <span className="text-indigo-400 font-medium">institutional-grade research</span>
          </h3>
          <p className="text-sm text-white/50 max-w-2xl mx-auto">
            Academic journals • Institutional databases • Leading think tanks
          </p>
        </div>
      </div>

      {/* Infinite scrolling institutional cards */}
      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-hidden px-4"
        style={{ 
          scrollBehavior: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {duplicatedProviders.map((provider, index) => {
          const colors = categoryColors[provider.category];
          const displayText = provider.abbreviation || provider.name;
          
          return (
            <div
              key={`${provider.id}-${index}`}
              className="flex-shrink-0 group"
            >
              <div className={`h-16 px-6 flex items-center justify-center rounded-xl bg-gradient-to-br ${colors.bg} border ${colors.border} transition-all duration-300 backdrop-blur-sm group-hover:scale-105`}>
                <div className="flex flex-col items-center">
                  <span className={`font-semibold text-sm tracking-wide ${colors.accent} group-hover:scale-110 transition-transform`}>
                    {displayText}
                  </span>
                  {provider.abbreviation && (
                    <span className={`text-xs ${colors.text} opacity-70 mt-0.5`}>
                      {provider.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category indicators */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center justify-center gap-8 text-xs text-white/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-br from-slate-400 to-slate-600"></div>
            <span>Academic Sources</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600"></div>
            <span>Institutional Data</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gradient-to-br from-purple-400 to-purple-600"></div>
            <span>Think Tank Research</span>
          </div>
        </div>
        
        <div className="text-center mt-6">
          <p className="text-xs text-white/30 max-w-3xl mx-auto">
            <span className="font-medium text-white/50">41 sources</span> • 
            <span className="mx-2">Real-time integration</span> • 
            <span className="mx-2">Peer-reviewed quality</span> • 
            <span className="mx-2">Global coverage</span>
          </p>
        </div>
      </div>
    </div>
  );
}
