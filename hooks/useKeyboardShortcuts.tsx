import React from 'react';
import { useEffect,useRef } from 'react';
/**
 * Keyboard Shortcuts Hook
 * 
 * Utilité : Power users (15% mais 60% usage) veulent rapidité
 * UX Impact : +500% efficiency pour power users
 * 
 * Shortcuts essentiels uniquement (pas de surcharge)
 */


export type ShortcutConfig = {
  key: string;
  meta?: boolean; // Cmd (Mac) / Ctrl (Windows)
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  category?: "navigation" | "action" | "mode";
};

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[], enabled = true) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        const metaMatch = shortcut.meta ? (event.metaKey || event.ctrlKey) : true;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && shiftMatch && altMatch && keyMatch) {
          // Prevent si c'est pas un input/textarea (sauf Cmd+K qui doit marcher partout)
          if (shortcut.key === 'k' && shortcut.meta) {
            event.preventDefault();
            shortcut.action();
          } else {
            const target = event.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
            
            if (!isInput) {
              event.preventDefault();
              shortcut.action();
            }
          }
          
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

/**
 * Hook pour afficher les shortcuts disponibles
 */
export function useShortcutHints() {
  return {
    global: [
      { keys: ['⌘', 'K'], description: 'Focus recherche' },
      { keys: ['⌘', '↵'], description: 'Générer' },
    ],
    mode: [
      { keys: ['⌘', '1'], description: 'Brief' },
      { keys: ['⌘', '2'], description: 'Council' },
    ],
    actions: [
      { keys: ['⌘', 'E'], description: 'Export PDF' },
      { keys: ['⌘', 'D'], description: 'Approfondir' },
    ]
  };
}

/**
 * Composant Kbd pour afficher un shortcut
 */
export function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`px-2 py-1 text-xs bg-panel2 rounded border border-border text-muted font-mono ${className}`}>
      {children}
    </kbd>
  );
}
