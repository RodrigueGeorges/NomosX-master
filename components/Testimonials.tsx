"use client";

import React from 'react';
import { Quote, Star, Building2, TrendingUp } from 'lucide-react';

const testimonials = [
  {
    name: "Sarah Chen",
    role: "CEO",
    company: "TechCorp Industries",
    quote: "NomosX identified market shifts 6 months before our competitors. The AI Council's insights helped us pivot our strategy and capture a $12M opportunity.",
    rating: 5,
    category: "strategic",
    results: "$12M revenue captured"
  },
  {
    name: "Michael Rodriguez",
    role: "CFO",
    company: "FinanceInc Global",
    quote: "Strategic reports saved us $2M in consulting fees while providing deeper insights. The quality exceeds McKinsey's analysis at 1% of the cost.",
    rating: 5,
    category: "financial",
    results: "$2M cost savings"
  },
  {
    name: "Dr. Emma Thompson",
    role: "VP Research",
    company: "Healthcare Innovations",
    quote: "The AI Council's analysis of clinical trial data identified patterns our internal team missed. This accelerated our R&D timeline by 18 months.",
    rating: 5,
    category: "research",
    results: "18 months acceleration"
  },
  {
    name: "James Park",
    role: "Director Strategy",
    company: "Sustainable Energy Co",
    quote: "Carbon pricing analysis from NomosX helped us navigate complex regulatory changes across 27 countries. Essential for our expansion strategy.",
    rating: 5,
    category: "regulatory",
    results: "27 countries analyzed"
  }
];

const categoryIcons = {
  strategic: TrendingUp,
  financial: Building2,
  research: Star,
  regulatory: Building2
};

const categoryColors = {
  strategic: "text-indigo-400",
  financial: "text-green-400",
  research: "text-purple-400",
  regulatory: "text-orange-400"
};

export default function Testimonials() {
  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Section Header */}
      <div className="text-center mb-16">
        <h3 className="nx-heading-2 text-white/95 mb-4">
          Trusted by Industry Leaders
        </h3>
        <p className="nx-body text-white/60 max-w-2xl mx-auto">
          See how executives are using NomosX to make strategic decisions with confidence
        </p>
      </div>

      {/* Testimonials Grid */}
      <div className="grid md:grid-cols-2 gap-8">
        {testimonials.map((testimonial, index) => {
          const IconComponent = categoryIcons[testimonial.category as keyof typeof categoryIcons];
          const colorClass = categoryColors[testimonial.category as keyof typeof categoryColors];
          
          return (
            <div
              key={index}
              className="nx-card p-8 group hover:border-indigo-500/20 transition-all duration-300"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-white/[0.06] flex items-center justify-center">
                    <IconComponent size={20} className={colorClass} />
                  </div>
                  <div>
                    <h4 className="text-white/90 font-medium">{testimonial.name}</h4>
                    <p className="text-white/60 text-sm">
                      {testimonial.role} at {testimonial.company}
                    </p>
                  </div>
                </div>
                
                {/* Rating */}
                <div className="flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className="text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
              </div>

              {/* Quote */}
              <blockquote className="text-white/80 leading-relaxed mb-6 group-hover:text-white/90 transition-colors">
                "{testimonial.quote}"
              </blockquote>

              {/* Results */}
              <div className="flex items-center justify-between pt-4 border-t border-white/[0.04]">
                <span className="text-sm text-white/50">Key Results</span>
                <span className={`text-sm font-medium ${colorClass}`}>
                  {testimonial.results}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust Indicators */}
      <div className="mt-16 text-center">
        <div className="inline-flex items-center gap-8 px-8 py-4 bg-white/[0.02] border border-white/[0.08] rounded-full">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-sm text-white/60">500+ Enterprise Clients</span>
          </div>
          <div className="w-px h-4 bg-white/[0.08]"></div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
            <span className="text-sm text-white/60">98% Satisfaction Rate</span>
          </div>
          <div className="w-px h-4 bg-white/[0.08]"></div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-400"></div>
            <span className="text-sm text-white/60">4.9/5 Average Rating</span>
          </div>
        </div>
      </div>
    </div>
  );
}
