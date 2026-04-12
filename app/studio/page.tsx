"use client";

import React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { PenTool, Sparkles, FileText, Layers, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import AuthModal from '@/components/AuthModal';

/**
 * StudioX — NomosX Research Studio
 *
 * STRATEGY tier subscribers can commission custom research
 * Ask a question → get a brief with Harvard Council insights
 */

function StudioPageContent() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setHasSession(!!data?.user);
        setSessionChecked(true);
      })
      .catch(() => { setHasSession(false); setSessionChecked(true); });
  }, []);

  async function handleGenerate() {
    if (!question.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/studiox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: question }],
          stream: false 
        }),
      });

      if (!res.ok) throw new Error('Failed to generate');

      const data = await res.json();
      setResult(data.content || 'No response generated');
    } catch (error) {
      console.error('Generation error:', error);
      setResult('Error generating response. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!sessionChecked) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );

  if (!hasSession) return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <div className="nx-noise" aria-hidden="true" />
      <PublicNav currentPage="studio" onSignInClick={() => setShowAuthModal(true)} />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-300 font-medium tracking-wide">STUDIOX</span>
          </div>
          <h1 className="text-4xl font-display font-bold text-white mb-4 tracking-tight">
            Studio<span className="text-amber-500">X</span>
          </h1>
          <p className="text-white/40 mb-8 text-sm leading-relaxed">
            Commission custom research through the full 16-agent pipeline. Create an account to get started — it&apos;s free.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center gap-2 mx-auto"
          >
            Get StudioX access
            <ArrowRight size={14} />
          </button>
          <p className="mt-4 text-xs text-white/25">Already have an account? <button onClick={() => setShowAuthModal(true)} className="text-white/50 hover:text-white underline underline-offset-2 transition-colors">Sign in</button></p>
        </div>
      </div>
      <SiteFooter onSignInClick={() => setShowAuthModal(true)} />
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => { setShowAuthModal(false); setHasSession(true); }}
        />
      )}
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
        <div className="nx-noise" aria-hidden="true" />
        {/* Background — aurora */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        {/* Nav */}
        <PublicNav currentPage="studio" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-glow" />
              <span className="text-xs text-amber-300 font-medium tracking-wide">STUDIOX</span>
            </div>
            <h1 className="text-5xl font-display font-bold text-white mb-4 tracking-tight">
              Studio<span className="text-amber-500">X</span>
            </h1>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Commission custom research with Harvard Council insights. Ask any question, get evidence-based answers.
            </p>
          </div>

        {/* Input Card */}
        <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl mb-8">
          <div className="p-6">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to research?"
              rows={4}
              className="mb-4 bg-[#0c0c10] border-white/10 text-white placeholder:text-white/30 resize-none focus:border-amber-500/50 focus:ring-amber-500/20"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />

            <div className="flex justify-end">
              <Button
                onClick={handleGenerate}
                disabled={!question.trim() || loading}
                className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-medium shadow-lg shadow-amber-500/20"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="mr-2" />
                    Generate Research
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Result */}
        {result && (
          <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl animate-fade-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <FileText size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">Research Result</h2>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-white/80 whitespace-pre-wrap">
                {result}
              </div>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {!result && !loading && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center mx-auto mb-6">
              <Layers size={40} className="text-white/20" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Ready to research</h3>
            <p className="text-white/40 max-w-md mx-auto">
              Ask any question above. StudioX will analyze the topic and provide evidence-based insights from 250M+ academic sources.
            </p>
          </div>
        )}
      </div>

      <SiteFooter onSignInClick={() => setShowAuthModal(true)} />

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => setShowAuthModal(false)}
        />
      )}
    </div>
    </>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="text-amber-500 animate-spin mx-auto mb-4" />
          <p className="text-white/50">Loading StudioX...</p>
        </div>
      </div>
    }>
      <StudioPageContent />
    </Suspense>
  );
}
