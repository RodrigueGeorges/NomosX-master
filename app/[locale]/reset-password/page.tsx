"use client";

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { LOGO_AUTH_SYMBOL } from '@/lib/brand/logo-config';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { PublicPageShell } from '@/components/layout/PublicPageShell';

function ResetPasswordContent() {
  const t = useTranslations();
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
      setError(t('ResetPassword.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('ResetPassword.passwordsDoNotMatch'));
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
        setError(data.error || t('ResetPassword.somethingWrong'));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t('ResetPassword.connectionError'));
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
          <h1 className="font-display text-2xl font-semibold text-text mb-3">{t('ResetPassword.invalidLink')}</h1>
          <p className="text-sm text-black/55 mb-6">{t('ResetPassword.invalidLinkDesc')}</p>
          <button onClick={() => router.push('/')} className="text-sm text-black/60 hover:text-black transition-colors">
            {t('ResetPassword.backToHome')}
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
          <div className="w-12 h-12 bg-black/10 border border-black/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={24} className="text-black" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-text mb-3">{t('ResetPassword.passwordReset')}</h1>
          <p className="text-sm text-black/55 mb-6">{t('ResetPassword.passwordResetSuccess')}</p>
          <button
            onClick={() => router.push('/?auth=required')}
            className="nx-public-btn-primary px-6 py-3 text-[11px]"
          >
            {t('ResetPassword.signIn')}
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

        <h1 className="font-display text-2xl font-semibold text-text text-center mb-2">{t('ResetPassword.chooseNewPassword')}</h1>
        <p className="text-sm text-black/55 text-center mb-8">{t('ResetPassword.enterNewPassword')}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-black/70">{t('ResetPassword.newPassword')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('ResetPassword.passwordPlaceholder')}
              required
              minLength={8}
              className="w-full px-4 py-3 bg-black/[0.04] border border-black/[0.12] text-black placeholder-black/20 text-sm focus:outline-none focus:border-black/50 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium mb-2 text-black/70">{t('ResetPassword.confirmPassword')}</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={t('ResetPassword.confirmPlaceholder')}
              required
              minLength={8}
              className="w-full px-4 py-3 bg-black/[0.04] border border-black/[0.12] text-black placeholder-black/20 text-sm focus:outline-none focus:border-black/50 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full py-3.5 nx-public-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('ResetPassword.resetting') : t('ResetPassword.resetPassword')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => router.push('/')} className="text-sm text-black/50 hover:text-black/60 transition-colors flex items-center gap-1.5 mx-auto">
            <ArrowLeft size={14} />
            {t('ResetPassword.backToHome')}
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
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border border-black/40 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

