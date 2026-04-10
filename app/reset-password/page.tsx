"use client";

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { ArrowLeft, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
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

  if (!token) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <NomosXLogo size="md" variant="full" className="justify-center mb-8" />
          <h1 className="font-display text-2xl font-light text-white mb-3">Invalid link</h1>
          <p className="text-sm text-white/40 mb-6">This password reset link is missing or invalid. Please request a new one.</p>
          <button onClick={() => router.push('/')} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <NomosXLogo size="md" variant="full" className="justify-center mb-8" />
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={24} className="text-emerald-400" />
          </div>
          <h1 className="font-display text-2xl font-light text-white mb-3">Password reset</h1>
          <p className="text-sm text-white/40 mb-6">Your password has been updated successfully. You can now sign in.</p>
          <button
            onClick={() => router.push('/?auth=required')}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium text-sm transition-all duration-300 shadow-lg shadow-indigo-500/25"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.10),transparent_70%)]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <NomosXLogo size="md" variant="full" />
        </div>

        <h1 className="font-display text-2xl font-light text-white text-center mb-2">Choose a new password</h1>
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
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.10] text-white placeholder-white/20 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
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
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.10] text-white placeholder-white/20 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
}
