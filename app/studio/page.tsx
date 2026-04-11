"use client";

import React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { PenTool, Sparkles, FileText, Layers, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils';

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

  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/20">
            <PenTool size={32} className="text-[#09090b]" />
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
    </div>
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
