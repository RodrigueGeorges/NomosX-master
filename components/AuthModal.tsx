"use client";

import React from 'react';
import { useState } from 'react';

import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Mail } from 'lucide-react';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { LOGO_AUTH_SYMBOL } from '@/lib/brand/logo-config';
import { BRAND_SHORT, BRAND_SOURCES_LABEL } from '@/lib/brand/public-copy';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuestion?: string;
  onSignupSuccess?: () => void;
}

export default function AuthModal({ isOpen, onClose, initialQuestion, onSignupSuccess }: AuthModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"oauth" | "email" | "login" | "forgot">("oauth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(true);
    setError("");
    setMode("email");
    setLoading(false);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint = isSignup ? "/api/auth/register" : "/api/auth/login";
      const body = isSignup 
        ? { email, password, name: name || undefined }
        : { email, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "An error occurred");
        setLoading(false);
        return;
      }

      onClose();
      
      if (isSignup && onSignupSuccess) {
        onSignupSuccess();
      } else {
        const redirectUrl = initialQuestion 
          ? `/dashboard?q=${encodeURIComponent(initialQuestion)}`
          : "/dashboard";
        
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  };

  const primaryBtn =
    "w-full p-4 bg-white text-black font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90";
  const inputFocus = "bg-white/[0.03] border-white/10 focus:border-white/35 text-base h-12";

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8 sm:p-10 max-w-lg w-full relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.03] blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/[0.02] blur-3xl" />
        </div>

        <div className="relative mb-10 text-center">
          <div className="flex justify-center mb-6">
            <NomosXLogo variant="symbol" size={LOGO_AUTH_SYMBOL} />
          </div>

          <div className="font-mono text-[10px] text-white/40 tracking-[0.25em] uppercase mb-4">
            {BRAND_SHORT}
          </div>

          <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight mb-3 text-text">
            Start your analysis
          </h2>

          <p className="text-base text-white/50 leading-relaxed max-w-md mx-auto mb-6">
            Join decision teams using probabilistic foresight — probable futures,
            decisions owned, evidence verified.
          </p>

          <div className="flex items-center justify-center gap-3 text-xs text-white/30 tracking-[0.15em] uppercase font-mono">
            <span>{BRAND_SOURCES_LABEL} Sources</span>
            <div className="w-1 h-1 rounded-full bg-white/30" />
            <span>Auto-published</span>
            <div className="w-1 h-1 rounded-full bg-white/30" />
            <span>Free to start</span>
          </div>
        </div>

        {mode === "oauth" ? (
          <div className="relative space-y-4">
            <button
              onClick={() => { setIsSignup(false); setMode("email"); }}
              className={`${primaryBtn} flex items-center justify-center gap-3`}
            >
              <Mail size={18} strokeWidth={2} />
              <span>Sign in with Email</span>
            </button>
            <button
              onClick={() => { setIsSignup(true); setMode("email"); }}
              className="w-full p-4 bg-white/[0.04] border border-white/[0.10] text-white/80 hover:text-white hover:border-white/25 hover:bg-white/[0.07] transition-all duration-300"
            >
              Create an account — free
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailAuth} className="relative space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {isSignup && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-3 text-white/70">
                  Name (optional)
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputFocus}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-3 text-white/70">
                Email address
              </label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoFocus={!isSignup}
                  className={`${inputFocus} pl-11`}
                />
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-3 text-white/70">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                required
                minLength={isSignup ? 8 : undefined}
                className={inputFocus}
              />
            </div>

            <button type="submit" disabled={loading || !email || !password} className={primaryBtn}>
              {loading ? "Connecting..." : (isSignup ? "Create Account" : "Sign In")}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setMode("oauth")}
                className="text-white/50 hover:text-white/80 transition-colors flex items-center gap-2"
              >
                <span>←</span>
                <span>Back</span>
              </button>
              <div className="flex items-center gap-3">
                {!isSignup && (
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setError(""); setForgotSent(false); }}
                    className="text-white/40 hover:text-white/60 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignup(!isSignup);
                    setError("");
                  }}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  {isSignup ? "Already have an account?" : "Create an account"}
                </button>
              </div>
            </div>
          </form>
        )}

        {mode === "forgot" && (
          <div className="relative space-y-6">
            {forgotSent ? (
              <div className="text-center py-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                  <span className="text-emerald-400 text-sm">✓</span>
                </div>
                <p className="text-sm text-white/60 mb-1">Check your inbox</p>
                <p className="text-xs text-white/35">If an account exists with that email, you&apos;ll receive a reset link.</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium mb-3 text-white/70">
                    Email address
                  </label>
                  <div className="relative">
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      autoFocus
                      className="w-full px-4 py-3 pl-11 bg-white/[0.03] border border-white/10 text-white placeholder-white/20 text-base focus:outline-none focus:border-white/35 transition-colors"
                    />
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading || !email}
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      const res = await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                      });
                      if (res.ok) {
                        setForgotSent(true);
                      } else {
                        const data = await res.json();
                        setError(data.error || 'Something went wrong.');
                      }
                    } catch {
                      setError('Connection error. Please try again.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className={primaryBtn}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </>
            )}
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setMode("oauth"); setError(""); setForgotSent(false); }}
                className="text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                ← Back to sign in
              </button>
            </div>
          </div>
        )}

        <div className="relative mt-8 pt-6 border-t border-white/[0.08]">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <div className="relative flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-emerald-400/60 animate-pulse" />
              </div>
              <span>Enterprise-grade security</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <div className="relative flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-white/40 animate-pulse" />
              </div>
              <span>No credit card required</span>
            </div>
          </div>

          <p className="text-xs text-white/30 text-center leading-relaxed">
            By continuing, you agree to our{" "}
            <a href="/terms" className="text-white/45 hover:text-white transition-colors">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-white/45 hover:text-white transition-colors">
              Privacy Policy
            </a>
          </p>
        </div>

        {loading && (
          <div className="relative mt-6 text-center">
            <div className="inline-flex items-center gap-3 text-sm text-white/50">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Securing your connection...</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
