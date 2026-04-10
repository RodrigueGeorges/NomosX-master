
"use client";
/**
 * PaywallTeaser Component
 * 
 * Shows a teaser for Strategic Reports to free users.
 * Displays executive summary + upgrade CTA.
 */

import React from 'react';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card,CardContent } from '@/components/ui/Card';
import { Lock,FileText,ArrowRight,CheckCircle,Layers,TrendingUp,Shield } from 'lucide-react';

interface PaywallTeaserProps {
  title: string;
  executiveSummary?: string;
  keyFindings?: string[];
  sourceCount?: number;
  pageCount?: string;
  publicationType?: string;
}

export default function PaywallTeaser({
  title,
  executiveSummary,
  keyFindings = [],
  sourceCount = 0,
  pageCount = "10-15",
  publicationType = "Strategic Report"
}: PaywallTeaserProps) {
  const router = useRouter();

  return (
    <div className="relative">
      {/* Teaser Content */}
      <Card variant="default" className="border-white/10 bg-white/[0.02] overflow-hidden">
        <CardContent className="pt-8 pb-0">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Layers size={24} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-amber-400/80 font-medium uppercase tracking-wider">{publicationType}</span>
                <span className="text-xs text-white/30">•</span>
                <span className="text-xs text-white/40">{pageCount} pages</span>
                <span className="text-xs text-white/30">•</span>
                <span className="text-xs text-white/40">{sourceCount} sources</span>
              </div>
              <h1 className="text-2xl font-light text-white leading-tight">{title}</h1>
            </div>
          </div>

          {/* Executive Summary Preview */}
          {executiveSummary && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Executive Summary</h2>
              <p className="text-white/60 leading-relaxed">
                {executiveSummary.slice(0, 400)}
                {executiveSummary.length > 400 && "..."}
              </p>
            </div>
          )}

          {/* Key Findings Preview */}
          {keyFindings.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Key Findings</h2>
              <ul className="space-y-2">
                {keyFindings.slice(0, 3).map((finding, i) => (
                  <li key={i} className="flex items-start gap-2 text-white/60">
                    <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{finding}</span>
                  </li>
                ))}
                {keyFindings.length > 3 && (
                  <li className="text-white/40 text-sm pl-6">
                    + {keyFindings.length - 3} more findings...
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>

        {/* Fade overlay */}
        <div className="h-32 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/80 to-transparent" />
      </Card>

      {/* Paywall CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-6">
        <Card variant="default" className="bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/20 shadow-[0_0_40px_rgba(99,102,241,0.1)]">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Lock size={24} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white mb-1">Full report available to subscribers</h3>
                  <p className="text-sm text-white/50">
                    Access the complete {pageCount}-page analysis with all sections and recommendations
                  </p>
                </div>
              </div>
              <Button 
                variant="ai" 
                onClick={() => router.push("/pricing")}
                className="flex-shrink-0"
              >
                Upgrade to NomosX Access
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </div>

            {/* What's included */}
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2 text-sm text-white/50">
                <FileText size={14} className="text-indigo-400" />
                <span>Full analysis</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <TrendingUp size={14} className="text-indigo-400" />
                <span>Scenario planning</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Shield size={14} className="text-indigo-400" />
                <span>Recommendations</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Layers size={14} className="text-indigo-400" />
                <span>PDF export</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
