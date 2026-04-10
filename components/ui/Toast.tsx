"use client";
import React from 'react';
import { useEffect,useState } from 'react';

import { cn } from '@/lib/utils';
import { CheckCircle2,XCircle,Info,AlertCircle,AlertTriangle,X } from 'lucide-react';

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastConfig = {
  id?: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 3000
};

let toastQueue: Array<ToastConfig & { id: string }> = [];
let listeners: Array<(toasts: typeof toastQueue) => void> = [];

export function toast(config: ToastConfig) {
  const id = config.id || Math.random().toString(36).substring(7);
  const newToast = { ...config, id };
  toastQueue = [...toastQueue, newToast];
  
  // Notify listeners
  listeners.forEach(listener => listener(toastQueue));
  
  // Auto-dismiss
  const duration = config.duration || 3000;
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }
  
  return id;
}

export function dismissToast(id: string) {
  toastQueue = toastQueue.filter(t => t.id !== id);
  listeners.forEach(listener => listener(toastQueue));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<typeof toastQueue>([]);
  
  useEffect(() => {
    const listener = (newToasts: typeof toastQueue) => setToasts(newToasts);
    listeners.push(listener);
    
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);
  
  if (toasts.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3 max-w-md">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastConfig & { id: string }; onDismiss: () => void }) {
  const icons = {
    success: <CheckCircle2 size={20} className="text-green-400" />,
    error: <XCircle size={20} className="text-red-400" />,
    info: <Info size={20} className="text-blue-400" />,
    warning: <AlertTriangle size={20} className="text-yellow-400" />
  };
  
  const bgColors = {
    success: "bg-green-500/10 border-green-500/30",
    error: "bg-red-500/10 border-red-500/30",
    info: "bg-blue-500/10 border-blue-500/30",
    warning: "bg-yellow-500/10 border-yellow-500/30"
  };
  
  return (
    <div 
      className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm ${bgColors[t.type]} animate-slide-in-right shadow-xl`}
    >
      <div className="mt-0.5">{icons[t.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{t.title}</p>
        {t.message && (
          <p className="text-xs text-muted mt-1">{t.message}</p>
        )}
      </div>
      <button 
        onClick={onDismiss}
        className="text-muted hover:text-foreground transition-colors ml-2"
      >
        <X size={16} />
      </button>
    </div>
  );
}
