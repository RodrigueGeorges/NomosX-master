import React from 'react';
import { useState,useCallback } from 'react';
/**
 * Hook: useAnalysisRun
 * 
 * Gère la création et le suivi d'une analyse avec le nouveau backend
 */


export interface AnalysisRun {
  id: string;
  correlationId: string;
  question: string;
  mode: "brief" | "council";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  trustScore?: number;
  qualityScore?: number;
  claimCount?: number;
  evidenceCount?: number;
  outputHtml?: string;
  createdAt: string;
}

export interface CreateAnalysisParams {
  question: string;
  mode: "brief" | "council";
  providers?: string[];
  maxSources?: number;
}

export function useAnalysisRun() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AnalysisRun | null>(null);

  const createAnalysis = useCallback(async (params: CreateAnalysisParams) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analysis/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create analysis");
      }

      setRun(data.run);
      return data.run;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStatus = useCallback(async (runId: string) => {
    try {
      const response = await fetch(`/api/analysis/${runId}/status`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get status");
      }

      setRun(data.run);
      return data.run;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  }, []);

  const pollStatus = useCallback(
    async (runId: string, intervalMs: number = 3000) => {
      const poll = async () => {
        const updatedRun = await getStatus(runId);

        if (updatedRun.status === "COMPLETED" || updatedRun.status === "FAILED") {
          return updatedRun;
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        return poll();
      };

      return poll();
    },
    [getStatus]
  );

  return {
    run,
    loading,
    error,
    createAnalysis,
    getStatus,
    pollStatus,
  };
}
