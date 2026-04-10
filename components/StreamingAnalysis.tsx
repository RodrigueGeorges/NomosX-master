
"use client";
import React from 'react';
import { useState,useEffect,useRef } from 'react';
/**
 * StreamingAnalysis Component
 * 
 * Real-time streaming of analysis results using Server-Sent Events (SSE)
 * Provides instant feedback and progressive disclosure of results
 */


import TrustScoreBadge from './TrustScoreBadge';
import ClaimCard from './ClaimCard';

interface StreamingAnalysisProps {
  runId: string;
  onComplete?: (result: AnalysisResult) => void;
  onError?: (error: Error) => void;
}

interface AnalysisResult {
  runId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  trustScore?: number;
  claims?: Claim[];
  progress?: AnalysisProgress;
}

interface AnalysisProgress {
  currentStep: string;
  completedSteps: string[];
  totalSteps: number;
  percentage: number;
}

interface Claim {
  id: string;
  text: string;
  trustScore: number;
  evidenceCount: number;
  claimType: string;
  confidence: number;
}

export default function StreamingAnalysis({ runId, onComplete, onError }: StreamingAnalysisProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isStreaming, setIsStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Setup SSE connection
    const eventSource = new EventSource(`/api/analysis/${runId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          // Update progress
          setResult(prev => prev ? { ...prev, progress: data.progress } : null);
        } else if (data.type === 'partial_result') {
          // Update with partial results
          setResult(prev => prev ? { ...prev, ...data.result } : data.result);
        } else if (data.type === 'complete') {
          // Final result
          setResult(data.result);
          setIsStreaming(false);
          eventSource.close();
          onComplete?.(data.result);
        } else if (data.type === 'error') {
          setError(data.message);
          setIsStreaming(false);
          eventSource.close();
          onError?.(new Error(data.message));
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setError('Connection error. Retrying...');
      eventSource.close();
      
      // Fallback to polling if SSE fails
      startPolling();
    };

    return () => {
      eventSource.close();
    };
  }, [runId, onComplete, onError]);

  const startPolling = () => {
    // Fallback: Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/analysis/${runId}/status`);
        const data = await response.json();
        
        setResult(data);
        
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(interval);
          setIsStreaming(false);
          if (data.status === 'COMPLETED') {
            onComplete?.(data);
          } else {
            onError?.(new Error(data.lastError || 'Analysis failed'));
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  };

  if (error && !result) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center gap-3 p-6">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-neutral-400">Initializing analysis...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      {isStreaming && result.progress && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">{result.progress.currentStep}</span>
            <span className="text-indigo-400 font-medium">{result.progress.percentage}%</span>
          </div>
          
          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ease-out"
              style={{ width: `${result.progress.percentage}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {result.progress.completedSteps.map((step, idx) => (
              <div 
                key={idx}
                className="px-3 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full flex items-center gap-2"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trust Score */}
      {result.trustScore !== undefined && (
        <div className="flex items-center gap-4 p-6 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <TrustScoreBadge score={result.trustScore} size="lg" />
          <div>
            <h3 className="text-lg font-semibold text-white">Trust Score</h3>
            <p className="text-sm text-neutral-400">Based on {result.claims?.length || 0} verified claims</p>
          </div>
        </div>
      )}

      {/* Claims (appear progressively) */}
      {result.claims && result.claims.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            Claims
            {isStreaming && (
              <span className="text-sm text-indigo-400 animate-pulse">
                (updating...)
              </span>
            )}
          </h3>
          
          {result.claims.map((claim, idx) => (
            <div 
              key={claim.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <ClaimCard 
                claim={{
                  ...claim,
                  claimType: ['factual', 'causal', 'evaluative', 'normative'].includes(claim.claimType as string)
                    ? (claim.claimType as "factual" | "causal" | "evaluative" | "normative")
                    : undefined,
                  confidence: claim.confidence || undefined,
                  trustScore: claim.trustScore || undefined,
                }} 
                onViewEvidence={() => {}} 
              />
            </div>
          ))}
        </div>
      )}

      {/* Completion Message */}
      {!isStreaming && result.status === 'COMPLETED' && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
          <p className="text-green-400 font-medium">✓ Analysis complete</p>
        </div>
      )}
    </div>
  );
}
