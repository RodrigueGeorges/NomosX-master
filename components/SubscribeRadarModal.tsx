"use client";
import React from 'react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Mail,Bell,Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscribeRadarModal({ isOpen, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (!email || !email.includes("@")) {
      setError("Invalid email");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/radar/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, frequency }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Subscription error");
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setEmail("");
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
            <Bell size={24} className="text-accent" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Subscribe to Radar</h2>
            <p className="text-sm text-muted">
              Receive weak signals directly by email
            </p>
          </div>
        </div>

        {/* Success state */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-600">
            <div className="flex items-center gap-2">
              <Check size={20} strokeWidth={1.5} />
              <p className="font-semibold">Subscription confirmed!</p>
            </div>
            <p className="text-sm mt-1 opacity-80">
              You will receive weak signals {frequency === "daily" ? "daily" : frequency === "weekly" ? "weekly" : "monthly"}
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600">
            <p className="font-semibold">❌ {error}</p>
          </div>
        )}

        {!success && (
          <>
            {/* Email input */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2">
                Email address
              </label>
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Frequency selector */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">
                Alert frequency
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setFrequency("daily")}
                  className={`flex-1 p-3 rounded-xl border transition-all ${
                    frequency === "daily"
                      ? "border-accent bg-accent/10 shadow-[0_0_20px_rgba(94,234,212,0.2)]"
                      : "border-border bg-panel hover:border-accent/50"
                  }`}
                >
                  <p className="font-semibold text-sm mb-1">Daily</p>
                  <p className="text-xs text-muted">Every day</p>
                </button>

                <button
                  onClick={() => setFrequency("weekly")}
                  className={`flex-1 p-3 rounded-xl border transition-all ${
                    frequency === "weekly"
                      ? "border-accent bg-accent/10 shadow-[0_0_20px_rgba(94,234,212,0.2)]"
                      : "border-border bg-panel hover:border-accent/50"
                  }`}
                >
                  <p className="font-semibold text-sm mb-1">Weekly</p>
                  <p className="text-xs text-muted">Every week</p>
                  <Badge variant="ai" className="mt-2 text-xs">Recommended</Badge>
                </button>

                <button
                  onClick={() => setFrequency("monthly")}
                  className={`flex-1 p-3 rounded-xl border transition-all ${
                    frequency === "monthly"
                      ? "border-accent bg-accent/10 shadow-[0_0_20px_rgba(94,234,212,0.2)]"
                      : "border-border bg-panel hover:border-accent/50"
                  }`}
                >
                  <p className="font-semibold text-sm mb-1">Monthly</p>
                  <p className="text-xs text-muted">Every month</p>
                </button>
              </div>
            </div>

            {/* Info box */}
            <div className="mb-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-blue-400 leading-relaxed">
                💡 <strong>How does it work?</strong> The Radar Agent automatically detects 
                weak signals (Novelty Score ≥ 60) and sends you a digest 
                at your chosen frequency with strategically relevant trends.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="ai"
                onClick={handleSubscribe}
                loading={loading}
                disabled={loading || !email}
                className="flex-1"
              >
                <Bell size={18} strokeWidth={1.5} />
                Subscribe
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
