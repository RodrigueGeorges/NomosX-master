"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function SearchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error("[Search Error Boundary]", error); }, [error]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-white mb-3">Search error</h1>
        <p className="text-white/60 mb-8">Something went wrong while searching. Please try again.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="ai" onClick={() => reset()}><RefreshCw size={18} className="mr-2" />Try again</Button>
          <Button variant="ghost" onClick={() => router.push("/")}><Home size={18} className="mr-2" />Home</Button>
        </div>
      </div>
    </div>
  );
}
