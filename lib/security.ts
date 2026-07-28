import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

export function rateLimit({
  windowMs = 15 * 60 * 1000, // 15 minutes
  maxRequests = 100,
}: {
  windowMs?: number
  maxRequests?: number
} = {}) {
  return (request: NextRequest) => {
    const ip = (request as any).ip || request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const windowStart = now - windowMs

    // Clean old entries
    Object.keys(store).forEach(key => {
      if (store[key].resetTime < windowStart) {
        delete store[key]
      }
    })

    // Check current IP
    const current = store[ip] || { count: 0, resetTime: now + windowMs }
    
    if (current.resetTime < now) {
      current.count = 0
      current.resetTime = now + windowMs
    }

    current.count++
    store[ip] = current

    return {
      success: current.count <= maxRequests,
      remaining: Math.max(0, maxRequests - current.count),
      resetTime: current.resetTime,
    }
  }
}

export const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

export function addSecurityHeaders(response: NextResponse) {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

// Validation schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
})

export const UpdateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
})

export const CreateBriefSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  type: z.enum(['ARTICLE', 'STRATEGIC_REPORT']),
  priority: z.enum(['low', 'medium', 'high']).optional(),
})

export const UpdateBriefSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').optional(),
  content: z.string().min(50, 'Content must be at least 50 characters').optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

export const SubscriptionSchema = z.object({
  plan: z.enum(['TRIAL', 'ANALYST', 'RESEARCHER', 'STUDIO']),
  paymentMethodId: z.string().optional(),
})

export const ContactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

// Rate limiting configurations
export const rateLimitConfigs = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 requests per 15 minutes
  api: { windowMs: 15 * 60 * 1000, maxRequests: 100 }, // 100 requests per 15 minutes
  upload: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 requests per minute
  search: { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests per minute
}

// Input sanitization
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove potential JS protocols
    .replace(/on\w+=/gi, '') // Remove potential event handlers
}

// SQL injection prevention (for raw queries)
export function sanitizeSqlInput(input: string): string {
  return input.replace(/['"\\;]/g, '')
}

// File upload validation
export const fileUploadConfig = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt'],
}

export function validateFileUpload(file: File) {
  if (file.size > fileUploadConfig.maxSize) {
    throw new Error('File size exceeds maximum allowed size')
  }
  
  if (!fileUploadConfig.allowedTypes.includes(file.type)) {
    throw new Error('File type not allowed')
  }
  
  const extension = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!fileUploadConfig.allowedExtensions.includes(extension)) {
    throw new Error('File extension not allowed')
  }
  
  return true
}