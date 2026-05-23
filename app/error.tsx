"use client";
import React from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Home, RefreshCw } from 'lucide-react';
import { NomosXLogo } from '@/components/brand/NomosXLogo';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[NomosX Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <NomosXLogo size="lg" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Something went wrong
        </h1>

        <p className="text-white/60 mb-8 leading-relaxed">
          An unexpected error occurred. Please try again or return to the home page.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="ai" onClick={() => reset()}>
            <RefreshCw size={18} className="mr-2" />
            Try again
          </Button>
          <Button variant="ghost" onClick={() => router.push("/")}>
            <Home size={18} className="mr-2" />
            Back to home
          </Button>
        </div>
      </div>
    </div>
  );
}
