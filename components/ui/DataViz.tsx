
"use client";
import React from 'react';

/**
 * OpenClaw Data Visualization Components
 * Composants pour la visualisation de données intelligentes
 */


import { cn } from '@/lib/utils';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/Card';

interface DataVizCardProps {
  title: string
  value: string | number
  change?: number
  trend?: 'up' | 'down' | 'neutral'
  icon?: React.ReactNode
  className?: string
}

export function DataVizCard({ title, value, change, trend = 'neutral', icon, className }: DataVizCardProps) {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600'
  }

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→'
  }

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className={cn('flex items-center text-xs', trendColors[trend])}>
            <span className="mr-1">{trendIcons[trend]}</span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </CardContent>
      
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 pointer-events-none" />
    </Card>
  )
}

interface ProgressVizProps {
  value: number
  max: number
  label?: string
  color?: 'primary' | 'secondary' | 'accent' | 'success'
  className?: string
}

export function ProgressViz({ value, max, label, color = 'primary', className }: ProgressVizProps) {
  const percentage = Math.min((value / max) * 100, 100)
  
  const colorClasses = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    accent: 'bg-accent',
    success: 'bg-success'
  }

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{value}/{max}</span>
        </div>
      )}
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-500 ease-out', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

interface SparklineVizProps {
  data: number[]
  color?: 'primary' | 'secondary' | 'accent'
  className?: string
}

export function SparklineViz({ data, color = 'primary', className }: SparklineVizProps) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  
  const colorClasses = {
    primary: '#1E40AF',
    secondary: '#7C3AED',
    accent: '#059669'
  }

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <div className={cn('relative h-8 w-full', className)}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke={colorClasses[color]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={colorClasses[color]} stopOpacity="0.3" />
            <stop offset="100%" stopColor={colorClasses[color]} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#sparkline-gradient)"
        />
      </svg>
    </div>
  )
}
