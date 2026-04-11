'use client';

import { useState, useEffect } from 'react';

interface ThreeComponentWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wrapper that ensures THREE is available before rendering Three.js components.
 * This prevents constructor errors during initial load.
 */
export function ThreeComponentWrapper({ children, fallback = null }: ThreeComponentWrapperProps) {
  const [isThreeReady, setIsThreeReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check if THREE is available after mount
    const checkThree = async () => {
      try {
        // Dynamically import THREE to ensure it's loaded
        const three = await import('three');
        if (three && typeof three !== 'undefined') {
          setIsThreeReady(true);
        }
      } catch {
        console.warn('[ThreeComponentWrapper] THREE not available');
        setIsThreeReady(false);
      }
    };

    checkThree();
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  if (!isThreeReady) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
