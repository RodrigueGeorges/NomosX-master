/**
 * Claim Card Component
 * 
 * Affiche une claim avec evidence, trust score et contradictions
 */

import React from 'react';
import { Badge } from './ui/Badge';
import { CheckCircle,AlertTriangle,XCircle } from 'lucide-react';

export interface Claim {
  id: string;
  text: string;
  claimType?: "factual" | "causal" | "evaluative" | "normative";
  confidence?: number;
  trustScore?: number;
  evidenceCount?: number;
  isVerified?: boolean;
  hasContradiction?: boolean;
  needsMoreEvidence?: boolean;
  isReliable?: boolean;
}

interface ClaimCardProps {
  claim: Claim;
  onViewEvidence?: (claimId: string) => void;
}

export default function ClaimCard({ claim, onViewEvidence }: ClaimCardProps) {
  const claimTypeColors = {
    factual: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    causal: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    evaluative: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    normative: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  };

  const claimTypeLabels = {
    factual: "Factuel",
    causal: "Causal",
    evaluative: "Évaluatif",
    normative: "Normatif",
  };

  const type = claim.claimType ?? "factual";

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5 hover:border-indigo-500/30 transition-all duration-300 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex gap-2 flex-wrap">
          <Badge variant="default" className={claimTypeColors[type]}>
            {claimTypeLabels[type]}
          </Badge>

          {claim.isVerified && (
            <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <CheckCircle size={12} className="mr-1" /> Vérifié
            </Badge>
          )}

          {claim.hasContradiction && (
            <Badge variant="default" className="bg-red-500/20 text-red-400 border-red-500/30">
              <AlertTriangle size={12} className="mr-1" /> Contradiction
            </Badge>
          )}

          {claim.needsMoreEvidence && (
            <Badge variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              <AlertTriangle size={12} className="mr-1" /> Plus d'evidence
            </Badge>
          )}
        </div>

        {claim.isReliable && (
          <div className="flex items-center gap-1 text-emerald-400 text-sm">
            <CheckCircle size={16} /> Fiable
          </div>
        )}
      </div>

      {/* Claim text */}
      <p className="text-white/85 text-base leading-relaxed mb-4">{claim.text}</p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-4 text-sm text-white/50">
          <span>Evidence: {claim.evidenceCount ?? 0}</span>
          {claim.trustScore !== undefined && (
            <span className="text-indigo-400">Trust: {Math.round(claim.trustScore * 100)}%</span>
          )}
          {claim.confidence !== undefined && (
            <span>Confidence: {Math.round(claim.confidence * 100)}%</span>
          )}
        </div>

        {onViewEvidence && (
          <button
            onClick={() => onViewEvidence(claim.id)}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            View evidence →
          </button>
        )}
      </div>
    </div>
  );
}
