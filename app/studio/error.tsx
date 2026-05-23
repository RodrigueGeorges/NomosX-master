'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { RefreshCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
    <div className="min-h-[60vh] bg-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-lg font-bold">!</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Studio Error</h2>
        <p className="text-white/50 text-sm mb-6">Something went wrong in the Studio. Please try again.</p>
        <div className="flex gap-3 justify-center">
          <Button variant="ai" onClick={() => reset()}>
            <RefreshCw size={16} className="mr-2" /> Retry
          </Button>
          <Button variant="ghost" onClick={() => router.push('/')}>
            <Home size={16} className="mr-2" /> Home
          </Button>
        </div>
      </div>
    </div>
  );
}
