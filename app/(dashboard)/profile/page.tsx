/**
 * Profile Page — NomosX Dashboard
 */

import { Metadata } from 'next';
import { Suspense } from 'react';
import { ProfileClient } from '@/components/features/user/ProfileClient';

export const metadata: Metadata = {
  title: 'Profile | NomosX',
  description: 'Manage your profile and account settings',
}

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs text-indigo-400/80 font-semibold tracking-[0.2em] uppercase mb-2">Account</p>
          <h1 className="font-display text-3xl font-light text-white mb-1">
            Your <span className="nx-gradient-text">Profile</span>
          </h1>
          <p className="text-sm text-white/40">
            Manage your personal information and account settings.
          </p>
        </div>

        {/* Profile Content */}
        <Suspense fallback={
          <div className="py-16 text-center">
            <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          </div>
        }>
          <ProfileClient />
        </Suspense>
      </div>
    </div>
  );
}
