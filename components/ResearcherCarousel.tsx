"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Researcher } from '@/lib/researchers';
import { ChevronLeft, ChevronRight, GraduationCap, Award, TrendingUp } from 'lucide-react';
import HexResearcherAvatar from './HexResearcherAvatar';

interface ResearcherCarouselProps {
  researchers: Researcher[];
  autoPlay?: boolean;
  speed?: number;
  showMetrics?: boolean;
  className?: string;
}

export default function ResearcherCarousel({
  researchers,
  autoPlay = true,
  speed = 3000,
  showMetrics = true,
  className = ''
}: ResearcherCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Auto-play functionality
  useEffect(() => {
    if (autoPlay && !isPaused) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % researchers.length);
      }, speed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoPlay, isPaused, speed, researchers.length]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + researchers.length) % researchers.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % researchers.length);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Get visible researchers (3 at a time for desktop, 1 for mobile)
  const getVisibleResearchers = () => {
    const visible = [];
    for (let i = 0; i < 3; i++) {
      const index = (currentIndex + i) % researchers.length;
      visible.push(researchers[index]);
    }
    return visible;
  };

  if (researchers.length === 0) return null;

  return (
    <div className={`relative w-full ${className}`}>
      {/* Main Carousel */}
      <div 
        className="relative overflow-hidden rounded-2xl"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Carousel Track */}
        <div className="flex transition-transform duration-500 ease-in-out">
          {getVisibleResearchers().map((researcher, index) => (
            <div
              key={`${researcher.id}-${currentIndex}`}
              className="flex-shrink-0 w-full px-4"
            >
              {/* Researcher Card */}
              <div className="bg-gradient-to-br from-slate-900/50 to-slate-800/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <HexResearcherAvatar
                      researcher={researcher}
                      size="lg"
                      showStatus={false}
                      interactive={false}
                    />
                    <div>
                      <h3 className="text-white font-semibold text-lg">{researcher.name}</h3>
                      <p className="text-white/70 text-sm">{researcher.title}</p>
                      <p className="text-white/50 text-xs">{researcher.institution}</p>
                    </div>
                  </div>
                  
                  {/* Tier Badge */}
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    researcher.tier === 'core' 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : researcher.tier === 'advanced'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {researcher.tier === 'core' ? 'Core' : researcher.tier === 'advanced' ? 'Advanced' : 'Specialized'}
                  </div>
                </div>

                {/* Domain & Specialty */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: researcher.colorHex }}
                    />
                    <span className="text-white font-medium">{researcher.domain}</span>
                  </div>
                  <p className="text-white/60 text-sm">{researcher.specialty}</p>
                </div>

                {/* Metrics */}
                {showMetrics && researcher.hIndex && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Award size={12} className="text-white/50" />
                        <span className="text-white/50 text-xs">h-index</span>
                      </div>
                      <p className="text-white font-semibold">{researcher.hIndex}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <GraduationCap size={12} className="text-white/50" />
                        <span className="text-white/50 text-xs">pubs</span>
                      </div>
                      <p className="text-white font-semibold">{researcher.publications}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <TrendingUp size={12} className="text-white/50" />
                        <span className="text-white/50 text-xs">citations</span>
                      </div>
                      <p className="text-white font-semibold">{researcher.citationCount?.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {/* Fields */}
                {researcher.fields && researcher.fields.length > 0 && (
                  <div>
                    <p className="text-white/50 text-xs mb-2">Specializations:</p>
                    <div className="flex flex-wrap gap-1">
                      {researcher.fields.slice(0, 3).map((field, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 rounded-full text-xs bg-white/10 text-white/70 border border-white/20"
                        >
                          {field}
                        </span>
                      ))}
                      {researcher.fields.length > 3 && (
                        <span className="px-2 py-1 rounded-full text-xs bg-white/5 text-white/50">
                          +{researcher.fields.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Controls */}
      <button
        onClick={handlePrevious}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all duration-200 z-10"
        aria-label="Previous researcher"
      >
        <ChevronLeft size={16} />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all duration-200 z-10"
        aria-label="Next researcher"
      >
        <ChevronRight size={16} />
      </button>

      {/* Progress Indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {researchers.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2 h-2 rounded-full transition-all duration-200 ${
              index === currentIndex
                ? 'bg-white w-8'
                : 'bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`Go to researcher ${index + 1}`}
          />
        ))}
      </div>

      {/* Auto-play Status */}
      <div className="flex justify-center mt-2">
        <div className={`flex items-center gap-2 text-xs ${
          isPaused ? 'text-white/50' : 'text-white/30'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${
            isPaused ? 'bg-white/50' : 'bg-green-400 animate-pulse'
          }`} />
          <span>{isPaused ? 'Paused' : 'Auto-playing'}</span>
        </div>
      </div>
    </div>
  );
}
