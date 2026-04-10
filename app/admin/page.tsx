"use client";
import React from 'react';
import { useState,useEffect } from 'react';

/**
 * ADMIN Dashboard — Think Tank Command Center
 * 
 * Purpose: Editorial control, system monitoring, publication decisions
 * Audience: Admin/Editorial team ONLY
 * 
 * Contains:
 * - System health & status
 * - Signals inbox (NEW/HELD/REJECTED)
 * - Editorial gate (publish/hold/silence decisions)
 * - Cadence monitor (daily/weekly limits)
 * - Newsletter control
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card,CardContent } from '@/components/ui/Card';
import TrustScoreBadge from '@/components/TrustScoreBadge';
import { cn } from '@/lib/utils';
import { Activity,Zap,FileText,Archive,Clock,CheckCircle,Pause,VolumeX,ArrowRight,RefreshCw,PenTool,AlertCircle,Shield } from 'lucide-react';

type Signal = {
  id: string;
  title: string;
  signalType: string;
  vertical?: { name: string };
  scores: { priority: number; novelty?: number; impact?: number };
  status: string;
  detectedAt: string;
};

type Publication = {
  id: string;
  title: string;
  type: string;
  vertical?: { name: string };
  trustScore: number;
  status: string;
  createdAt: string;
};

type SubscriptionStatus = {
  weeklyPublicationCount: number;
  weeklyPublicationMax: number;
  weeklyLimitReached: boolean;
};

export default function AdminCommandCenter() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pendingSignals, setPendingSignals] = useState<Signal[]>([]);
  const [recentPublications, setRecentPublications] = useState<Publication[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    setLoading(true);
    try {
      const [signalsRes, publicationsRes, subRes] = await Promise.all([
        fetch("/api/think-tank/signals?status=NEW&limit=12"),
        fetch("/api/think-tank/publications?limit=8"),
        fetch("/api/subscription/status"),
      ]);

      if (signalsRes.ok) {
        const data = await signalsRes.json();
        setPendingSignals(data.signals || []);
      }
      if (publicationsRes.ok) {
        const data = await publicationsRes.json();
        setRecentPublications(data.publications || []);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setSubscription(data);
      }
    } catch (error) {
      console.error("Failed to load admin data:", error);
    } finally {
      setLoading(false);
    }
  }

  const totalPendingSignals = pendingSignals.length;
  const heldSignals = pendingSignals.filter(s => s.status === "HELD").length;
  const systemStatus = totalPendingSignals > 0 ? "Monitoring" : "Silent";
  const statusColor = totalPendingSignals > 0 ? "text-indigo-400" : "text-white/40";

  return (
    <Shell>
      <div className="max-w-7xl mx-auto">
        {/* Header - System Status */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                <Activity size={32} className="text-indigo-400" />
              </div>
              <div>
                <div className="text-xs text-indigo-400/60 tracking-[0.25em] uppercase mb-1">
                  Admin
                </div>
                <h1 className="text-4xl font-light tracking-tight text-white/95">Command Center</h1>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">System Status</div>
              <div className={`text-4xl font-light ${statusColor}`}>{systemStatus}</div>
              <div className="text-xs text-white/30 mt-1">Silence is a success state</div>
            </div>
          </div>
        </div>

        {/* Core Metrics - 3 Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* Signals */}
          <Card variant="default" className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Zap size={18} className="text-amber-400" />
                </div>
                <div className="flex-1">
                  <div className="text-4xl font-light text-amber-400">{totalPendingSignals}</div>
                  <div className="text-xs text-amber-400/60">Pending Signals</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30">Held: {heldSignals}</span>
              </div>
            </CardContent>
          </Card>

          {/* Editorial Cadence */}
          <Card variant="default" className="bg-background/[0.02] border-white/10">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Clock size={18} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="text-4xl font-light text-white">
                    {subscription?.weeklyPublicationCount || 0} / {subscription?.weeklyPublicationMax || 3}
                  </div>
                  <div className="text-xs text-white/40">This week</div>
                </div>
              </div>
              <div className="w-full bg-background/5 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all"
                  style={{ 
                    width: `${Math.min(100, ((subscription?.weeklyPublicationCount || 0) / (subscription?.weeklyPublicationMax || 3)) * 100)}%` 
                  }}
                />
              </div>
              <div className="text-xs text-white/30 mt-2">Editorial discipline enforced</div>
            </CardContent>
          </Card>

          {/* Publications */}
          <Card variant="default" className="bg-background/[0.02] border-white/10">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Archive size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-4xl font-light text-white">{recentPublications.length}</div>
                  <div className="text-xs text-white/40">Recent</div>
                </div>
              </div>
              <div className="text-xs text-white/30">Editorial snapshot</div>
            </CardContent>
          </Card>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Signals Inbox (CORE) */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-4xl font-semibold text-white flex items-center gap-2">
                <Zap size={18} className="text-amber-400" />
                Signals Inbox
              </h2>
              <Link href="/signals" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-all duration-200">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            
            {pendingSignals.length === 0 ? (
              <Card variant="default" className="bg-background/[0.02] border-white/10">
                <CardContent className="pt-10 pb-10 text-center">
                  <Zap size={28} className="text-white/20 mx-auto mb-3" />
                  <p className="text-white/50 text-sm font-medium">No pending signals</p>
                  <p className="text-white/30 text-xs mt-1">System is monitoring autonomously</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pendingSignals.map(signal => (
                  <Card 
                    key={signal.id}
                    variant="default"
                    className="bg-background/[0.02] border-white/10 hover:border-amber-500/30 cursor-pointer transition-all group"
                    onClick={() => router.push(`/studio?signalId=${signal.id}`)}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-amber-400">{signal.scores.priority}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate group-hover:text-indigo-300 transition-colors">{signal.title}</p>
                          <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                            {signal.vertical && <span>{signal.vertical.name}</span>}
                            <span>•</span>
                            <Badge variant={signal.status === "NEW" ? "warning" : "default"} className="text-xs px-1.5 py-0">
                              {signal.status}
                            </Badge>
                            {signal.scores.novelty && (
                              <>
                                <span>•</span>
                                <span>Novelty {signal.scores.novelty}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ArrowRight size={14} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Editorial Snapshot */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-4xl font-semibold text-white flex items-center gap-2">
                <Archive size={18} className="text-emerald-400" />
                Editorial Snapshot
              </h2>
              <Link href="/publications" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-all duration-200">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            
            {recentPublications.length === 0 ? (
              <Card variant="default" className="bg-background/[0.02] border-white/10">
                <CardContent className="pt-10 pb-10 text-center">
                  <Archive size={28} className="text-white/20 mx-auto mb-3" />
                  <p className="text-white/50 text-sm font-medium">No publications yet</p>
                  <p className="text-white/30 text-xs mt-1">The think tank decides when to publish</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {recentPublications.map(pub => (
                  <Card 
                    key={pub.id}
                    variant="default"
                    className="bg-background/[0.02] border-white/10 hover:border-emerald-500/30 cursor-pointer transition-all group"
                    onClick={() => router.push(`/publications/${pub.id}`)}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-3">
                        <TrustScoreBadge score={pub.trustScore} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate group-hover:text-indigo-300 transition-colors">{pub.title}</p>
                          <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                            {pub.vertical && <span>{pub.vertical.name}</span>}
                            <span>•</span>
                            <span>{pub.type.replace("_", " ")}</span>
                          </div>
                        </div>
                        {pub.status === "PUBLISHED" && <CheckCircle size={14} className="text-emerald-400" />}
                        {pub.status === "HELD" && <Pause size={14} className="text-amber-400" />}
                        {pub.status === "SILENT" && <VolumeX size={14} className="text-white/30" />}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Cadence Monitor */}
        {subscription && (
          <section className="mb-8">
            <Card variant="default" className={subscription.weeklyLimitReached ? "bg-amber-500/5 border-amber-500/20" : "bg-background/[0.02] border-white/10"}>
              <CardContent className="pt-6 pb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Clock size={20} className={subscription.weeklyLimitReached ? "text-amber-400" : "text-white/40"} />
                    <div>
                      <p className="text-sm font-medium text-white">Cadence Monitor</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {subscription.weeklyLimitReached 
                          ? "Weekly limit reached — Silence is respected" 
                          : "Editorial discipline enforced"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="text-4xl font-light text-white">
                        {subscription.weeklyPublicationCount} / {subscription.weeklyPublicationMax}
                      </div>
                      <div className="text-xs text-white/40">This week</div>
                    </div>
                  </div>
                </div>
                
                {subscription.weeklyLimitReached && (
                  <div className="mt-4 pt-4 border-t border-amber-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-400" />
                      <span className="text-sm text-amber-400">Silence is a success state — No publication required</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Admin Actions */}
        <div className="flex gap-3">
          <Button 
            variant="ai" 
            onClick={() => router.push("/studio")}
          >
            <PenTool size={18} className="mr-2" />
            Open Studio
          </Button>
          <Button variant="ghost" onClick={() => router.push("/signals")}>
            <Zap size={18} className="mr-2" />
            Signals
          </Button>
          <Button variant="ghost" onClick={() => router.push("/publications")}>
            <Archive size={18} className="mr-2" />
            Publications
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={loadAdminData} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
    </Shell>
  );
}
