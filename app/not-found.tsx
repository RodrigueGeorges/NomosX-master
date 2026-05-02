"use client";
import React from 'react';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Home,ArrowLeft } from 'lucide-react';
import { NomosXLogo } from '@/components/brand/NomosXLogo';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <NomosXLogo size="lg" />
        </div>

        {/* 404 */}
        <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-amber-100 mb-4">
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
