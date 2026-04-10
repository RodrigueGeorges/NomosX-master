
"use client";
import React from 'react';
import { useEffect } from 'react';

import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Notifications() {
  const { notifications, removeNotification } = useAppStore()

  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            "max-w-sm rounded-lg border p-4 shadow-lg",
            "animate-in slide-in-from-right-full",
            notification.type === 'success' && "border-green-500/30 bg-green-500/10 text-green-300",
            notification.type === 'error' && "border-red-500/30 bg-red-500/10 text-red-300",
            notification.type === 'warning' && "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
            notification.type === 'info' && "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{notification.message}</p>
            <button
              onClick={() => removeNotification(notification.id)}
              className="ml-4 text-sm opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}