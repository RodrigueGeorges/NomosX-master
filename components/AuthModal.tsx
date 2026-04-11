"use client";

import React from 'react';
import { useState } from 'react';

import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Mail } from 'lucide-react';
import { NomosXLogo3D } from '@/components/brand/NomosXLogo3D';

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
    // TODO: Wire real OAuth via NextAuth or similar
    // For now, redirect to email signup
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

      // Success - session cookie is set by the API
      // Auth successful — cookie set by API
      
      onClose();
      
      // If signup, trigger onboarding
      if (isSignup && onSignupSuccess) {
        onSignupSuccess();
      } else {
        // Login - redirect to dashboard
        const redirectUrl = initialQuestion 
          ? `/dashboard?q=${encodeURIComponent(initialQuestion)}`
          : "/dashboard";
        
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-8 sm:p-10 max-w-lg w-full relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/8 to-transparent blur-3xl" />
        </div>

        {/* Header */}
        <div className="relative mb-10 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <NomosXLogo3D size={60} />
          </div>

          {/* Title */}

          {/* Small caps */}
          <div className="text-xs text-indigo-300/70 tracking-[0.25em] uppercase mb-4">
            Institutional Intelligence
          </div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl font-light leading-tight mb-3">
            <span className="bg-gradient-to-r from-white via-violet-200 to-white bg-clip-text text-transparent">
              Start your analysis
            </span>
          </h2>

          {/* Subtitle */}
          <p className="text-base text-white/50 leading-relaxed max-w-md mx-auto mb-6">
            Join decision teams and research institutions 
            using institutional-grade autonomous intelligence.
          </p>

          {/* Trust Bar */}
          <div className="flex items-center justify-center gap-3 text-xs text-white/30 tracking-[0.15em] uppercase">
            <span>250M+ Sources</span>
            <div className="w-1 h-1 rounded-full bg-indigo-400/40" />
            <span>Auto-published</span>
            <div className="w-1 h-1 rounded-full bg-indigo-400/40" />
            <span>Free to start</span>
          </div>
        </div>

        {mode === "oauth" ? (
          <div className="relative space-y-4">
            <button
              onClick={() => { setIsSignup(false); setMode("email"); }}
              className="group relative w-full p-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:shadow-[0_0_50px_rgba(99,102,241,0.5)] transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-violet-500 opacity-0 group-hover:opacity-100 blur-sm transition-opacity" />
              <div className="relative flex items-center justify-center gap-3">
                <Mail size={18} strokeWidth={2} />
                <span>Sign in with Email</span>
              </div>
            </button>
            <button
              onClick={() => { setIsSignup(true); setMode("email"); }}
              className="group relative w-full p-4 rounded-xl bg-white/[0.04] border border-white/[0.10] text-white/80 hover:text-white hover:border-indigo-500/30 hover:bg-white/[0.07] transition-all duration-300"
            >
              <div className="relative flex items-center justify-center gap-3">
                <span>Create an account — free</span>
              </div>
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
                  className="bg-white/[0.03] border-white/10 focus:border-indigo-500/50 text-base h-12"
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
                  className="bg-white/[0.03] border-white/10 focus:border-indigo-500/50 text-base h-12 pl-11"
                />
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400/60" />
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
                className="bg-white/[0.03] border-white/10 focus:border-indigo-500/50 text-base h-12"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="group relative w-full p-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:shadow-[0_0_50px_rgba(99,102,241,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-violet-500 opacity-0 group-hover:opacity-100 blur-sm transition-opacity" />
              <span className="relative">
                {loading ? "Connecting..." : (isSignup ? "Create Account" : "Sign In")}
              </span>
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
                  className="text-indigo-300/70 hover:text-indigo-300 transition-colors"
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
                <p className="text-xs text-white/35">If an account exists with that email, you'll receive a reset link.</p>
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
                      className="w-full px-4 py-3 pl-11 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-white/20 text-base focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400/60" />
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
                  className="group relative w-full p-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:shadow-[0_0_50px_rgba(99,102,241,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Footer Premium */}
        <div className="relative mt-8 pt-6 border-t border-white/[0.08]">
          {/* Trust Indicators */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <div className="relative flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-emerald-400/60 animate-pulse"></div>
              </div>
              <span>Enterprise-grade security</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <div className="relative flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-indigo-400/60 animate-pulse"></div>
              </div>
              <span>No credit card required</span>
            </div>
          </div>

          {/* Legal */}
          <p className="text-xs text-white/30 text-center leading-relaxed">
            By continuing, you agree to our{" "}
            <a href="/terms" className="text-indigo-300/60 hover:text-indigo-300 transition-colors">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-indigo-300/60 hover:text-indigo-300 transition-colors">
              Privacy Policy
            </a>
          </p>
        </div>

        {loading && (
          <div className="relative mt-6 text-center">
            <div className="inline-flex items-center gap-3 text-sm text-indigo-300">
              <div className="relative">
                <div className="w-4 h-4 border-2 border-indigo-400/20 rounded-full"></div>
                <div className="absolute inset-0 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <span>Securing your connection...</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
