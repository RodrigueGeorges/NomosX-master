'use client';

import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { nx } from '@/lib/brand/public-ui';
import { cn } from '@/lib/utils';

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Studio Error]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 nx-public-surface flex items-center justify-center mx-auto mb-4">
          <span className="text-black/70 text-lg font-mono">!</span>
        </div>
        <h2 className="font-display text-xl font-semibold text-black mb-2">Studio Error</h2>
        <p className={cn(nx.body, "mb-6")}>Something went wrong in the Studio. Please try again.</p>
        <div className="flex gap-3 justify-center">
          <button type="button" onClick={() => reset()} className={cn(nx.btnPrimary, "group")}>
            <RefreshCw size={16} /> Retry
          </button>
          <button type="button" onClick={() => router.push('/')} className={nx.btnSecondary}>
            <Home size={16} /> Home
          </button>
        </div>
      </div>
    </div>
  );
}
