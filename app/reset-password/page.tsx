"use client";

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { LOGO_AUTH_SYMBOL } from '@/lib/brand/logo-config';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { PublicPageShell } from '@/components/layout/PublicPageShell';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cardClass = "w-full max-w-sm mx-auto nx-public-surface p-8 sm:p-10";

  if (!token) {
    return (
      <PublicPageShell showFooter={false} particles={0} contentClassName="flex items-center justify-center px-6">
        <div className={`${cardClass} text-center`}>
          <NomosXLogo variant="symbol" size={LOGO_AUTH_SYMBOL} className="justify-center mb-8" />
          <h1 className="font-display text-2xl font-semibold text-text mb-3">Invalid link</h1>
          <p className="text-sm text-white/40 mb-6">This password reset link is missing or invalid. Please request a new one.</p>
          <button onClick={() => router.push('/')} className="text-sm text-white/60 hover:text-white transition-colors">
            ← Back to home
          </button>
        </div>
      </PublicPageShell>
    );
  }

  if (success) {
    return (
      <PublicPageShell showFooter={false} particles={0} contentClassName="flex items-center justify-center px-6">
        <div className={`${cardClass} text-center`}>
          <NomosXLogo variant="symbol" size={LOGO_AUTH_SYMBOL} className="justify-center mb-8" />
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={24} className="text-emerald-400" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-text mb-3">Password reset</h1>
          <p className="text-sm text-white/40 mb-6">Your password has been updated successfully. You can now sign in.</p>
          <button
            onClick={() => router.push('/?auth=required')}
            className="nx-public-btn-primary px-6 py-3 text-[11px]"
          >
            Sign in
          </button>
        </div>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell showFooter={false} particles={10} contentClassName="flex items-center justify-center px-6 py-16">
      <div className={cardClass}>
        <div className="flex justify-center mb-8">
          <NomosXLogo variant="symbol" size={LOGO_AUTH_SYMBOL} />
        </div>

        <h1 className="font-display text-2xl font-semibold text-text text-center mb-2">Choose a new password</h1>
        <p className="text-sm text-white/40 text-center mb-8">Enter your new password below.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-white/60">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.10] text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/35 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium mb-2 text-white/60">Confirm password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              required
              minLength={8}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.10] text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/35 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full py-3.5 nx-public-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => router.push('/')} className="text-sm text-white/35 hover:text-white/60 transition-colors flex items-center gap-1.5 mx-auto">
            <ArrowLeft size={14} />
            Back to home
          </button>
        </div>
      </div>
    </PublicPageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

