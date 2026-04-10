
"use client";
import React from 'react';
import { useEffect,useState } from 'react';

/**
 * NomosX Signals Page - ADMIN ONLY
 * 
 * Signal Detection Layer - surfaces topics that MAY deserve a publication
 * Radar NEVER produces final output, only feeds the Editorial Gate
 * 
 * ACCESS: Admin/Editorial only - internal mechanism
 */

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Shell from '@/components/Shell';
import { Card,CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { Zap,RefreshCw,Filter,Clock,TrendingUp,AlertCircle,CheckCircle,XCircle,Pause,ArrowRight,Layers } from 'lucide-react';

type SignalStatus = "NEW" | "HELD" | "PUBLISHED" | "REJECTED" | "EXPIRED" | "SILENT";

type Signal = {
  id: string;
  title: string;
  summary: string;
  signalType: string;
  vertical?: { id: string; name: string; slug: string; color?: string };
  scores: {
    novelty: number;
    impact: number;
    confidence: number;
    urgency: number;
    priority: number;
  };
  status: SignalStatus;
  sourceCount: number;
  detectedAt: string;
  editorialDecision?: {
    decision: string;
    reason?: string;
    decidedAt: string;
  };
};

const STATUS_CONFIG: Record<SignalStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  NEW: { label: "Pending", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  HELD: { label: "Held", icon: Pause, color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  PUBLISHED: { label: "Published", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  REJECTED: { label: "Rejected", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  EXPIRED: { label: "Expired", icon: AlertCircle, color: "text-white/40", bg: "bg-background/5 border-white/10" },
  SILENT: { label: "Silent", icon: Pause, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  NEW_EVIDENCE: "New Evidence",
  CONTRADICTION: "Contradiction",
  TREND_BREAK: "Trend Break",
  DATA_RELEASE: "Data Release",
  POLICY_CHANGE: "Policy Change",
  METHODOLOGY_SHIFT: "Methodology Shift"
};

export default function SignalsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SignalStatus | "ALL">("ALL");

  // Check admin access
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !(user?.role === "ADMIN" || user?.email?.includes("admin"))) {
        router.push("/dashboard"); // Redirect non-admin users
        return;
      }
      loadSignals();
    }
  }, [authLoading, isAuthenticated, user, router]);

  async function loadSignals() {
    setLoading(true);
    try {
      const res = await fetch("/api/think-tank/signals?limit=50");
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals || []);
      }
    } catch (error) {
      console.error("Failed to load signals:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredSignals = statusFilter === "ALL" 
    ? signals 
    : signals.filter(s => s.status === statusFilter);

  const statusCounts = {
    ALL: signals.length,
    NEW: signals.filter(s => s.status === "NEW").length,
    HELD: signals.filter(s => s.status === "HELD").length,
    PUBLISHED: signals.filter(s => s.status === "PUBLISHED").length,
    REJECTED: signals.filter(s => s.status === "REJECTED").length,
    EXPIRED: signals.filter(s => s.status === "EXPIRED").length,
    SILENT: signals.filter(s => s.status === "SILENT").length,
  };

  function handleSignalClick(signal: Signal) {
    // Navigate to studio with signal context
    router.push(`/studio?signalId=${signal.id}`);
  }

  return (
    <Shell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Zap size={28} className="text-amber-400" />
            </div>
            <div>
              <div className="text-xs text-amber-400/60 tracking-[0.25em] uppercase mb-1">
                Signal Detection
              </div>
              <h1 className="text-4xl font-light tracking-tight text-white/95">Signals</h1>
            </div>
          </div>
          <p className="text-base text-white/50 leading-relaxed max-w-3xl ml-[4.5rem]">
            Topics detected by the system that may deserve a publication. 
            Signals feed the Editorial Gate — they never produce final output directly.
          </p>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Button
            variant={statusFilter === "ALL" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("ALL")}
          >
            All ({statusCounts.ALL})
          </Button>
          {(Object.keys(STATUS_CONFIG) as SignalStatus[]).map(status => {
            const config = STATUS_CONFIG[status];
            const Icon = config.icon as React.ComponentType<{ size?: number; className?: string }>;
            return (
              <Button
                key={status}
                variant={statusFilter === status ? "primary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={statusFilter === status ? "" : config.color}
              >
                <Icon size={14} className="mr-1.5" />
                {config.label} ({statusCounts[status]})
              </Button>
            );
          })}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={loadSignals} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {/* Signals List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-background/[0.02] border border-white/10 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredSignals.length === 0 ? (
          <Card variant="default" className="bg-background/[0.02] border-white/10">
            <CardContent className="pt-16 pb-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-4">
                <Zap size={32} className="text-amber-400/50" />
              </div>
              <h3 className="text-4xl font-semibold text-white mb-2">
                {statusFilter === "ALL" ? "No signals detected" : `No ${STATUS_CONFIG[statusFilter as SignalStatus]?.label.toLowerCase()} signals`}
              </h3>
              <p className="text-white/50 text-sm">
                Signals are automatically detected by the monitoring system.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSignals.map(signal => {
              const statusConfig = STATUS_CONFIG[signal.status];
              const StatusIcon = statusConfig.icon as React.ComponentType<{ size?: number; className?: string }>;
              
              return (
                <Card 
                  key={signal.id}
                  variant="default"
                  className="group hover:border-indigo-500/30 hover:bg-background/[0.04] transition-all duration-300 bg-background/[0.02] border-white/10 cursor-pointer"
                  onClick={() => handleSignalClick(signal)}
                >
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start gap-4">
                      {/* Priority Score */}
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-4xl font-bold text-amber-400">{signal.scores.priority}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="text-base font-medium text-white line-clamp-1 group-hover:text-indigo-300 transition-colors">
                            {signal.title}
                          </h3>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {signal.vertical && (
                              <Badge variant="default" className="text-xs bg-background/5 border-white/10">
                                <Layers size={10} className="mr-1" />
                                {signal.vertical.name}
                              </Badge>
                            )}
                            <Badge variant="default" className={`text-xs ${statusConfig.bg}`}>
                              <StatusIcon size={10} className="mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-sm text-white/50 line-clamp-2 mb-3">{signal.summary}</p>

                        <div className="flex items-center gap-4 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <TrendingUp size={12} />
                            Novelty: {signal.scores.novelty}
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap size={12} />
                            Impact: {signal.scores.impact}
                          </span>
                          <span>{signal.sourceCount} sources</span>
                          <span>
                            {new Date(signal.detectedAt).toLocaleDateString("en-US", {
                              day: "numeric",
                              month: "short"
                            })}
                          </span>
                          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-indigo-300 flex items-center gap-1">
                            Open in Studio <ArrowRight size={12} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
