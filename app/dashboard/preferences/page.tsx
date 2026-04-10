"use client";
import React from 'react';
import { useState,useEffect } from 'react';

/**
 * User Preferences Page
 * 
 * Allows users to:
 * - Select which research verticals to follow
 * - Configure email delivery preferences
 * - Manage notification settings
 */

import { Select } from '@/components/ui/Select';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { Button } from '@/components/ui/Button';
import { Card,CardContent } from '@/components/ui/Card';
import { Check,Loader2,Mail,Bell,Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vertical {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  enabled: boolean;
}

export default function PreferencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailFrequency, setEmailFrequency] = useState("WEEKLY");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    setLoading(true);
    try {
      const [verticalsRes, prefsRes] = await Promise.all([
        fetch("/api/user/verticals"),
        fetch("/api/user/preferences"),
      ]);

      if (verticalsRes.ok) {
        const data = await verticalsRes.json();
        setVerticals(data.verticals || []);
      }

      if (prefsRes.ok) {
        const data = await prefsRes.json();
        setEmailEnabled(data.emailEnabled);
        setEmailFrequency(data.emailFrequency);
      }
    } catch (err) {
      console.error("Failed to load preferences:", err);
      setError("Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }

  function toggleVertical(verticalId: string) {
    setVerticals(
      verticals.map((v) =>
        v.id === verticalId ? { ...v, enabled: !v.enabled } : v
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const preferences = verticals.map((v) => ({
        verticalId: v.id,
        enabled: v.enabled,
      }));

      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verticalPreferences: preferences,
          emailEnabled,
          emailFrequency,
        }),
      });

      if (res.ok) {
        setSuccess("Preferences saved successfully");
        setTimeout(() => setSuccess(""), 3000);
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

  const selectedCount = verticals.filter((v) => v.enabled).length;

  return (
    <Shell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.15)]">
              <SettingsIcon size={32} className="text-indigo-400" />
            </div>
            <div>
              <div className="text-xs text-indigo-300/70 tracking-[0.25em] uppercase mb-1">
                Your Preferences
              </div>
              <h1 className="text-4xl font-light tracking-tight text-white/95">
                Research Settings
              </h1>
            </div>
          </div>
          <p className="text-white/60">
            Customize which research verticals you follow and how you receive updates.
          </p>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-sm text-emerald-400">{success}</p>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 size={32} className="text-indigo-400 animate-spin mx-auto mb-3" />
            <p className="text-white/40 text-sm">Loading preferences...</p>
          </div>
        ) : (
          <>
            {/* Research Verticals */}
            <section className="mb-8">
              <div className="mb-4">
                <h2 className="text-4xl font-light text-white/95 flex items-center gap-2 mb-2">
                  <Bell size={20} className="text-indigo-400" />
                  Research Verticals
                </h2>
                <p className="text-sm text-white/60">
                  Select the topics you want to follow. You'll receive weekly briefs for selected verticals.
                </p>
              </div>

              <div className="mb-4 p-4 rounded-lg bg-background/[0.02] border border-white/10">
                <p className="text-sm text-white/70">
                  <span className="text-indigo-300 font-medium">{selectedCount}</span> vertical
                  {selectedCount !== 1 ? "s" : ""} selected
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {verticals.map((vertical) => (
                  <Card
                    key={vertical.id}
                    variant="default"
                    className={`cursor-pointer transition-all ${
                      vertical.enabled
                        ? "bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                        : "bg-background/[0.02] border-white/10 hover:border-indigo-500/20"
                    }`}
                    onClick={() => toggleVertical(vertical.id)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                            vertical.enabled
                              ? "bg-indigo-500/20 border border-indigo-500/40"
                              : "bg-background/5 border border-white/10"
                          }`}
                        >
                          {vertical.enabled ? (
                            <Check size={18} className="text-indigo-300" />
                          ) : (
                            <span className="text-4xl">{vertical.icon || "📊"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`text-sm font-medium mb-1 transition-colors ${
                              vertical.enabled ? "text-indigo-300" : "text-white"
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
                ))}
              </div>
            </section>

            {/* Email Settings */}
            <section className="mb-8">
              <div className="mb-4">
                <h2 className="text-4xl font-light text-white/95 flex items-center gap-2 mb-2">
                  <Mail size={20} className="text-indigo-400" />
                  Email Delivery
                </h2>
                <p className="text-sm text-white/60">
                  Configure how often you receive research briefs by email.
                </p>
              </div>

              <Card variant="default" className="bg-background/[0.02] border-white/10">
                <CardContent className="pt-6 pb-6">
                  {/* Email Enabled Toggle */}
                  <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/10">
                    <div>
                      <p className="text-sm font-medium text-white mb-1">
                        Receive weekly briefs by email
                      </p>
                      <p className="text-xs text-white/40">
                        Get personalized research updates delivered to your inbox
                      </p>
                    </div>
                    <button
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        emailEnabled ? "bg-indigo-500" : "bg-background/10"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                          emailEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Email Frequency */}
                  {emailEnabled && (
                    <div>
                      <p className="text-sm font-medium text-white mb-3">Delivery frequency</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "DAILY", label: "Daily" },
                          { value: "WEEKLY", label: "Weekly" },
                          { value: "MONTHLY", label: "Monthly" },
                        ].map((freq) => (
                          <button
                            key={freq.value}
                            onClick={() => setEmailFrequency(freq.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              emailFrequency === freq.value
                                ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
                                : "bg-background/5 border border-white/10 text-white/60 hover:border-indigo-500/20"
                            }`}
                          >
                            {freq.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="ai"
                onClick={handleSave}
                disabled={saving || selectedCount === 0}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>Save Preferences</>
                )}
              </Button>
              <Button variant="ghost" onClick={() => router.push("/dashboard")}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
