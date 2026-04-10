
"use client";
import React from 'react';
import { useState,useEffect,Suspense } from 'react';

/**
 * NomosX Studio - STRATEGY TIER ONLY
 * 
 * STRATEGY subscribers can initiate custom research
 * User expresses: "I need analysis on this specific topic"
 * Output: Custom publication with Harvard Council insights
 * 
 * ACCESS LEVEL: STRATEGY tier only
 */

import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { useSearchParams,useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card,CardContent,CardHeader } from '@/components/ui/Card';
import { PenTool,Sparkles,MessagesSquare,FileText,Download,Zap,DollarSign,Cpu,Heart,Users,AlertTriangle,ArrowRight,Layers,CheckCircle,Clock } from 'lucide-react';
import { detectIntent,type IntentResult } from '@/lib/ai/intent-detection';
import SmartSuggestions from '@/components/SmartSuggestions';
import { useKeyboardShortcuts,Kbd } from '@/hooks/useKeyboardShortcuts';
import { useStreamingBrief } from '@/hooks/useStreamingBrief';
import { useStreamingCouncil } from '@/hooks/useStreamingCouncil';
import ProgressBar from '@/components/ProgressBar';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// STRATEGY tier check hook
function useStrategyTier() {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/subscription/status')
      .then(res => res.json())
      .then(data => {
        setSubscription(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const isStrategyTier = subscription?.plan === 'STRATEGY' && !subscription?.studioLimitReached;
  const canAccessStudio = !loading && isStrategyTier;

  return { subscription, loading, canAccessStudio, isStrategyTier };
}

type PublicationType = "EXECUTIVE_BRIEF" | "STRATEGIC_REPORT";

const PUBLICATION_TYPES: { value: PublicationType; label: string; description: string; icon: React.ElementType; pages: string; audience: string }[] = [
  { 
    value: "EXECUTIVE_BRIEF", 
    label: "Executive Brief", 
    description: "Decision-ready synthesis with key findings", 
    icon: FileText,
    pages: "2-3 pages",
    audience: "Free newsletter"
  },
  { 
    value: "STRATEGIC_REPORT", 
    label: "Strategic Report", 
    description: "Deep analysis with scenarios and recommendations", 
    icon: Layers,
    pages: "10-15 pages",
    audience: "Paid subscribers"
  },
];

type BriefResult = {
  title: string;
  html: string;
  sources: Array<{ id: string; title: string; year?: number; provider?: string }>;
};

type CouncilResult = {
  economic: string;
  technical: string;
  ethical: string;
  political: string;
  synthesis: string;
  uncertainty: string;
  sources: Array<{ id: string; num: number; title: string; year?: number; provider?: string }>;
};

function StudioPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // STRATEGY tier check
  const { subscription, loading, canAccessStudio, isStrategyTier } = useStrategyTier();
  
  const [question, setQuestion] = useState("");
  const [publicationType, setPublicationType] = useState<PublicationType>("EXECUTIVE_BRIEF");
  const [selectedVertical, setSelectedVertical] = useState<string>("");
  const [verticals, setVerticals] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [detectedIntent, setDetectedIntent] = useState<IntentResult | null>(null);
  const [signalContext, setSignalContext] = useState<{ id: string; title: string } | null>(null);
  
  const [briefResult, setBriefResult] = useState<BriefResult | null>(null);
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null);
  const [showDeliberation, setShowDeliberation] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string>("DRAFT");
  const [gateDecision, setGateDecision] = useState<{ decision: string; reasons: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const streamingBrief = useStreamingBrief();
  const streamingCouncil = useStreamingCouncil();

  // Redirect if not STRATEGY tier
  useEffect(() => {
    if (!loading && !canAccessStudio) {
      if (subscription?.plan === 'TRIAL') {
        router.push('/pricing');
      } else if (subscription?.plan === 'EXECUTIVE') {
        router.push('/pricing?upgrade=strategy');
      } else {
        router.push('/pricing');
      }
    }
  }, [loading, canAccessStudio, subscription, router]);

  // Show loading state
  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
            <div className="text-white/50 mb-2">Loading Studio</div>
            <div className="text-white/20 text-sm">Initializing research environment...</div>
          </div>
        </div>
      </Shell>
    );
  }

  // Show upgrade prompt if not STRATEGY tier
  if (!canAccessStudio) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
              <Layers size={32} className="text-indigo-400" />
            </div>
            <h2 className="font-display text-2xl font-light text-white mb-4">
              Studio requires <span className="nx-gradient-text">Strategy</span> tier
            </h2>
            <p className="text-white/40 mb-6">
              Upgrade to Strategy for unlimited custom research with Harvard Council insights.
            </p>
            <button
              onClick={() => router.push('/pricing')}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 text-white font-medium hover:border-indigo-500/40 transition-all"
            >
              Upgrade to Strategy
            </button>
            <div className="mt-4 text-xs text-white/30">
              {subscription?.studioQuestionsRemaining !== undefined && (
                <>Questions remaining: {subscription.studioQuestionsRemaining}</>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  useKeyboardShortcuts([
    {
      key: 'k',
      meta: true,
      action: () => document.querySelector('textarea')?.focus(),
      description: 'Focus input',
      category: 'navigation'
    },
    {
      key: 'Enter',
      meta: true,
      action: () => !streamingBrief.loading && !streamingCouncil.loading && question.trim() && handleGenerate(),
      description: 'Generate',
      category: 'action'
    }
  ]);

  // Load verticals
  useEffect(() => {
    async function loadVerticals() {
      try {
        const res = await fetch("/api/think-tank/verticals");
        if (res.ok) {
          const data = await res.json();
          setVerticals(data.verticals || []);
        }
      } catch (error) {
        console.error("Failed to load verticals:", error);
      }
    }
    loadVerticals();
  }, []);

  // Handle signal context from URL
  useEffect(() => {
    const signalId = searchParams.get("signalId");
    if (signalId) {
      // Load signal details
      fetch(`/api/think-tank/signals/${signalId}`)
        .then(res => res.json())
        .then(data => {
          if (data.signal) {
            setSignalContext({ id: data.signal.id, title: data.signal.title });
            setQuestion(data.signal.title);
            if (data.signal.verticalId) {
              setSelectedVertical(data.signal.verticalId);
            }
          }
        })
        .catch(console.error);
    }
  }, [searchParams]);

  // Intent detection
  useEffect(() => {
    if (question.trim().length > 10) {
      const intent = detectIntent(question);
      setDetectedIntent(intent);
    } else {
      setDetectedIntent(null);
    }
  }, [question]);

  async function handleGenerate() {
    if (!question.trim()) return;

    setBriefResult(null);
    setCouncilResult(null);

    try {
      // For now, use existing brief generation
      // In production, this would create a draft publication
      await streamingBrief.generateBrief(question);
    } catch (error) {
      console.error("Generation error:", error);
    }
  }

  async function handleDeliberate() {
    if (!question.trim()) return;
    
    setShowDeliberation(true);
    try {
      await streamingCouncil.generateCouncil(question);
    } catch (error) {
      console.error("Deliberation error:", error);
    }
  }

  // Sync results
  useEffect(() => {
    if (streamingBrief.result) {
      setBriefResult({
        title: question,
        html: streamingBrief.result.html,
        sources: streamingBrief.result.sources,
      });
    }
  }, [streamingBrief.result, question]);

  useEffect(() => {
    if (streamingCouncil.result) {
      setCouncilResult(streamingCouncil.result);
    }
  }, [streamingCouncil.result]);

  async function handleCreateDraft() {
    if (!question.trim() || !selectedVertical) {
      toast({ type: "error", title: "Error", message: "Question and vertical required" });
      return;
    }

    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verticalId: selectedVertical,
          signalId: signalContext?.id || null,
          type: publicationType,
          question: question.trim(),
          title: briefResult?.title || question.trim().slice(0, 100),
        }),
      });

      if (!res.ok) throw new Error("Failed to create draft");
      
      const data = await res.json();
      setDraftId(data.draft.id);
      setDraftStatus("DRAFT");
      toast({ type: "success", title: "Draft created", message: "You can now submit it to the Editorial Gate" });
    } catch (error) {
      console.error("Create draft error:", error);
      toast({ type: "error", title: "Error", message: "Unable to create draft" });
    }
  }

  async function handleSubmitToEditorialGate() {
    if (!draftId) {
      // Create draft first if not exists
      await handleCreateDraft();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/drafts/${draftId}/submit`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to submit to gate");
      
      const data = await res.json();
      setGateDecision({ decision: data.decision, reasons: data.reasons });
      setDraftStatus(data.decision === "PUBLISH" ? "APPROVED" : data.decision === "HOLD" ? "UNDER_REVIEW" : "REJECTED");
      
      const decisionMessages: Record<string, { type: "success" | "info" | "warning" | "error"; title: string; message: string }> = {
        PUBLISH: { type: "success", title: "Publication approved", message: "The draft will be published" },
        HOLD: { type: "warning", title: "Held", message: "Human review required" },
        REJECT: { type: "error", title: "Rejected", message: data.reasons?.[0] || "Does not meet criteria" },
        SILENCE: { type: "info", title: "Silence", message: "Topic does not warrant publication" },
      };
      
      const msg = decisionMessages[data.decision] || { type: "info", title: data.decision, message: "" };
      toast(msg);
    } catch (error) {
      console.error("Submit to gate error:", error);
      toast({ type: "error", title: "Error", message: "Unable to submit to Editorial Gate" });
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = streamingBrief.loading || streamingCouncil.loading;

  return (
    <Shell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 sm:gap-4 mb-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <PenTool size={24} className="sm:w-7 sm:h-7 text-indigo-400" />
            </div>
            <div>
              <div className="text-xs text-indigo-300/70 tracking-[0.25em] uppercase mb-1">
                Propose to Think Tank
              </div>
              <h1 className="text-4xl sm:text-4xl md:text-4xl font-light tracking-tight text-white/95">Publication Studio</h1>
            </div>
          </div>
          <p className="text-sm sm:text-base text-white/50 leading-relaxed max-w-3xl sm:ml-[4.5rem]">
            Propose topics to the autonomous Think Tank. Your proposal will be evaluated by the Editorial Gate. 
            The Think Tank may publish, hold for review, or choose strategic silence.
          </p>
        </div>

        {/* Signal Context Banner */}
        {signalContext && (
          <Card variant="default" className="mb-6 bg-amber-500/5 border-amber-500/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Zap size={18} className="text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm text-white/70">Based on detected signal:</p>
                  <p className="text-white font-medium">{signalContext.title}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSignalContext(null)}>
                  Detach
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Input */}
        <Card variant="default" className="border-white/10 bg-background/[0.02] backdrop-blur-xl mb-8">
          <CardContent className="pt-6">
            {/* Publication Type Selection - Simplified to 2 formats */}
            <div className="mb-6">
              <label className="text-xs text-white/40 uppercase tracking-wider mb-3 block">Publication Format</label>
              <div className="grid grid-cols-2 gap-3">
                {PUBLICATION_TYPES.map(type => {
                  const Icon = type.icon as React.ComponentType<{ size?: number; className?: string }>;
                  const isSelected = publicationType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setPublicationType(type.value)}
                      disabled={isLoading}
                      className={`
                        p-4 rounded-xl text-left transition-all
                        ${isSelected 
                          ? 'bg-indigo-500/10 border-2 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.1)]' 
                          : 'bg-background/[0.02] border border-white/10 hover:border-white/20'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-indigo-500/20' : 'bg-background/5'}`}>
                          <Icon size={20} className={isSelected ? 'text-indigo-300' : 'text-white/40'} />
                        </div>
                        <div>
                          <div className={`font-medium ${isSelected ? 'text-white' : 'text-white/70'}`}>{type.label}</div>
                          <div className="text-xs text-white/40">{type.pages}</div>
                        </div>
                      </div>
                      <p className="text-xs text-white/50 mb-2">{type.description}</p>
                      <div className={`text-xs px-2 py-1 rounded-full inline-block ${
                        type.value === "EXECUTIVE_BRIEF" 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {type.audience}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vertical Selection */}
            {verticals.length > 0 && (
              <div className="mb-6">
                <label className="text-xs text-white/40 uppercase tracking-wider mb-3 block">Vertical</label>
                <div className="flex flex-wrap gap-2">
                  {verticals.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVertical(v.id)}
                      disabled={isLoading}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5
                        ${selectedVertical === v.id 
                          ? 'bg-background/10 text-white border border-white/20' 
                          : 'text-white/40 hover:text-white/60 hover:bg-background/[0.03]'
                        }
                      `}
                    >
                      <Layers size={14} />
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Question Input */}
            <div className="relative">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What question deserves institutional publication?"
                rows={4}
                className="mb-4 bg-gradient-to-br from-slate-900/50 to-slate-800/50 border border-white/10 focus:border-indigo-500/50 focus:shadow-[0_0_20px_rgba(99,102,241,0.1)] text-base resize-none backdrop-blur-sm transition-all"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              {question.length > 0 && (
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
                </div>
              )}
            </div>

            {/* Intent Detection */}
            {detectedIntent && detectedIntent.confidence > 0.6 && (
              <div className="mb-4 text-xs text-indigo-300/80 flex items-center gap-1.5">
                <Sparkles size={12} />
                Suggested format: {detectedIntent.type === "brief" ? "Executive Brief" : "Strategic Report"} ({Math.round(detectedIntent.confidence * 100)}%)
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-2 text-xs text-white/30">
                <Kbd>⌘K</Kbd>
                <span>focus</span>
                <span className="text-white/10">•</span>
                <Kbd>⌘↵</Kbd>
                <span>generate</span>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="ai"
                  onClick={handleGenerate}
                  disabled={!question.trim() || isLoading}
                  className="relative overflow-hidden group"
                >
                  {isLoading ? (
                    <>
                      <Zap size={18} className="mr-2 animate-pulse" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} className="mr-2 group-hover:rotate-12 transition-transform" />
                      Generate {publicationType === "EXECUTIVE_BRIEF" ? "Brief" : "Report"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {isLoading && (
          <div className="mb-8">
            <ProgressBar 
              progress={typeof streamingBrief.progress === 'number' ? streamingBrief.progress : (typeof streamingCouncil.progress === 'number' ? streamingCouncil.progress : 0)}
              message={streamingBrief.loading ? 'Generating draft...' : 'Deliberation in progress...'}
            />
          </div>
        )}

        {/* Draft Result */}
        {briefResult && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <FileText size={20} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-4xl font-semibold text-white">Draft</h2>
                    <Badge variant="warning" className="text-xs">Pending decision</Badge>
                  </div>
                  <p className="text-sm text-white/50">{briefResult.sources.length} sources • {PUBLICATION_TYPES.find(t => t.value === publicationType)?.label}</p>
                </div>
              </div>
              <Button variant="ai" size="sm" onClick={handleSubmitToEditorialGate}>
                <CheckCircle size={16} className="mr-2" />
                Submit to Editorial Gate
              </Button>
            </div>

            <Card variant="default" className="border-white/10 bg-background/[0.02]">
              <CardContent className="pt-8">
                <div 
                  className="nomosx-prose"
                  dangerouslySetInnerHTML={{ __html: briefResult.html }}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Deliberation Panel */}
        {showDeliberation && councilResult && (
          <div className="mt-8 space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <MessagesSquare size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-4xl font-semibold text-white">Deliberation</h2>
                <p className="text-sm text-white/50">4 perspectives to inform the decision</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              <Card variant="default" className="border-l-4 border-l-indigo-500/50 bg-background/[0.02]">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-indigo-400" />
                    <h3 className="text-base font-semibold text-white">Economic</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="nomosx-prose text-sm" dangerouslySetInnerHTML={{ __html: councilResult.economic }} />
                </CardContent>
              </Card>

              <Card variant="default" className="border-l-4 border-l-blue-500/50 bg-background/[0.02]">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-primary" />
                    <h3 className="text-base font-semibold text-white">Technical</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="nomosx-prose text-sm" dangerouslySetInnerHTML={{ __html: councilResult.technical }} />
                </CardContent>
              </Card>

              <Card variant="default" className="border-l-4 border-l-rose-500/50 bg-background/[0.02]">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Heart size={16} className="text-rose-400" />
                    <h3 className="text-base font-semibold text-white">Ethical</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="nomosx-prose text-sm" dangerouslySetInnerHTML={{ __html: councilResult.ethical }} />
                </CardContent>
              </Card>

              <Card variant="default" className="border-l-4 border-l-purple-500/50 bg-background/[0.02]">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-secondary" />
                    <h3 className="text-base font-semibold text-white">Political</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="nomosx-prose text-sm" dangerouslySetInnerHTML={{ __html: councilResult.political }} />
                </CardContent>
              </Card>
            </div>

            <Card variant="default" className="bg-background/[0.02]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-400" />
                  <h3 className="text-4xl font-semibold text-white">Synthesis</h3>
                </div>
              </CardHeader>
              <CardContent>
                <div className="nomosx-prose" dangerouslySetInnerHTML={{ __html: councilResult.synthesis }} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !briefResult && !councilResult && (
          <div className="space-y-8">
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
                <PenTool size={32} className="text-white" />
              </div>
              <h3 className="text-4xl font-semibold text-white mb-2">Create a publication</h3>
              <p className="text-white/50 text-sm max-w-md mx-auto">
                Select a format, a vertical, and ask your question. 
                The system will generate a draft submitted to the Editorial Gate.
              </p>
            </div>
            
            <SmartSuggestions
              onSelectSuggestion={(q) => {
                setQuestion(q);
                setTimeout(() => document.querySelector('textarea')?.focus(), 100);
              }}
            />
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={
      <Shell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mx-auto mb-4"></div>
            <p className="text-white/50">Loading...</p>
          </div>
        </div>
      </Shell>
    }>
      <StudioPageContent />
    </Suspense>
  );
}
