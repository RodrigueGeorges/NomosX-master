"use client";
import React from 'react';
import { useState,useEffect } from 'react';

import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Card,CardContent } from '@/components/ui/Card';
import { Check,Sparkles,Loader2 } from 'lucide-react';

interface Vertical {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  enabled: boolean;
}

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [selectedVerticals, setSelectedVerticals] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadVerticals();
    }
  }, [isOpen]);

  async function loadVerticals() {
    setLoading(true);
    try {
      const res = await fetch("/api/user/verticals");
      if (res.ok) {
        const data = await res.json();
        setVerticals(data.verticals || []);
        
        // Pre-select top 3 most active verticals
        const topThree = data.verticals.slice(0, 3).map((v: Vertical) => v.id);
        setSelectedVerticals(new Set(topThree));
      } else {
        setError("Failed to load research verticals");
      }
    } catch (err) {
      console.error("Failed to load verticals:", err);
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleVertical(verticalId: string) {
    const newSelected = new Set(selectedVerticals);
    if (newSelected.has(verticalId)) {
      newSelected.delete(verticalId);
    } else {
      newSelected.add(verticalId);
    }
    setSelectedVerticals(newSelected);
  }

  function selectAll() {
    setSelectedVerticals(new Set(verticals.map(v => v.id)));
  }

  async function handleContinue() {
    if (selectedVerticals.size === 0) {
      setError("Please select at least one research vertical");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Save preferences
      const preferences = verticals.map(v => ({
        verticalId: v.id,
        enabled: selectedVerticals.has(v.id),
      }));

      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verticalPreferences: preferences,
          emailEnabled: true,
          emailFrequency: "WEEKLY",
        }),
      });

      if (res.ok) {
        onClose();
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save preferences");
      }
    } catch (err) {
      console.error("Failed to save preferences:", err);
      setError("Connection error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => {}}>
      <div className="p-8 sm:p-10 max-w-3xl w-full relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/8 to-transparent blur-3xl" />
        </div>

        {/* Header */}
        <div className="relative mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#12121A] to-[#1A1A28] border border-white/10 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.15)]">
              <svg width="40" height="40" viewBox="0 0 120 120" fill="none">
                <defs>
                  <linearGradient id="onboardingGradient" x1="30%" y1="0%" x2="70%" y2="100%">
                    <stop offset="0%" style={{stopColor: '#6366F1', stopOpacity: 1}} />
                    <stop offset="100%" style={{stopColor: '#4A7FE0', stopOpacity: 1}} />
                  </linearGradient>
                </defs>
                <path d="M 25 30 L 25 90 L 33 90 L 33 30 Z" fill="url(#onboardingGradient)"/>
                <path d="M 33 35 L 60 60 L 87 85 L 93 80 L 60 53 L 33 28 Z" fill="url(#onboardingGradient)"/>
                <path d="M 87 35 L 60 60 L 33 85 L 27 80 L 60 53 L 87 28 Z" fill="url(#onboardingGradient)" opacity="0.9"/>
                <path d="M 87 30 L 87 90 L 95 90 L 95 30 Z" fill="url(#onboardingGradient)"/>
                <circle cx="60" cy="60" r="6" fill="white"/>
                <circle cx="60" cy="60" r="3" fill="#6366F1"/>
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-light tracking-tight text-white/95 mb-2">
            <span className="bg-gradient-to-r from-white via-indigo-200 to-white bg-clip-text text-transparent">
              Personalize Your Intelligence
            </span>
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Select the research areas you want to follow. You'll receive weekly briefs tailored to your interests.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="relative mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="relative py-20 text-center">
            <Loader2 size={32} className="text-indigo-400 animate-spin mx-auto mb-3" />
            <p className="text-white/40 text-sm">Loading research verticals...</p>
          </div>
        ) : (
          <>
            {/* Verticals Grid */}
            <div className="relative mb-6 grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
              {verticals.map((vertical) => {
                const isSelected = selectedVerticals.has(vertical.id);
                
                return (
                  <Card
                    key={vertical.id}
                    variant="default"
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                        : "bg-white/[0.02] border-white/10 hover:border-indigo-500/20"
                    }`}
                    onClick={() => toggleVertical(vertical.id)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected
                              ? "bg-indigo-500/20 border border-indigo-500/40"
                              : "bg-white/5 border border-white/10"
                          }`}
                        >
                          {isSelected ? (
                            <Check size={18} className="text-indigo-400" />
                          ) : (
                            <span className="text-lg">{vertical.icon || "📊"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`text-sm font-medium mb-1 transition-colors ${
                              isSelected ? "text-indigo-300" : "text-white"
                            }`}
                          >
                            {vertical.name}
                          </h3>
                          {vertical.description && (
                            <p className="text-xs text-white/40 line-clamp-2">
                              {vertical.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Selection Info */}
            <div className="relative mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70">
                    <span className="text-indigo-400 font-medium">{selectedVerticals.size}</span> vertical
                    {selectedVerticals.size !== 1 ? "s" : ""} selected
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    You can change this anytime in your preferences
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  Select all
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="relative flex gap-3">
              <Button
                variant="ai"
                onClick={handleContinue}
                disabled={saving || selectedVerticals.size === 0}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Saving preferences...
                  </>
                ) : (
                  <>Continue to Dashboard</>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  router.push("/dashboard");
                }}
                disabled={saving}
              >
                Skip for now
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
