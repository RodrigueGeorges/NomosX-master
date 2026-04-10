"use client";
import React from 'react';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Home,ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="white"/>
              <circle cx="12" cy="4" r="2" fill="white" opacity="0.7"/>
              <circle cx="20" cy="12" r="2" fill="white" opacity="0.7"/>
              <circle cx="12" cy="20" r="2" fill="white" opacity="0.7"/>
              <circle cx="4" cy="12" r="2" fill="white" opacity="0.7"/>
            </svg>
          </div>
          <span className="text-3xl font-bold text-white">
            Nomos<span className="text-indigo-400">X</span>
          </span>
        </div>

        {/* 404 */}
        <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 mb-4">
          404
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Page not found
        </h1>

        <p className="text-white/60 mb-8 leading-relaxed">
          The page you are looking for does not exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            variant="ai" 
            onClick={() => router.push("/")}
          >
            <Home size={18} className="mr-2" />
            Back to home
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => router.back()}
          >
            <ArrowLeft size={18} className="mr-2" />
            Previous page
          </Button>
        </div>
      </div>
    </div>
  );
}
