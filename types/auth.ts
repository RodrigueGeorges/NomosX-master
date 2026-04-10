/**
 * Types Auth - Types TypeScript pour l'authentification
 */

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: 'user' | 'admin' | 'superadmin'
  plan: 'free' | 'professional' | 'enterprise' | 'custom'
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
  emailVerified: boolean
  isActive: boolean
}

export interface AuthSession {
  user: User
  token: string
  expiresAt: Date
  refreshToken?: string
}

export interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
}

export interface RegisterCredentials {
  email: string
  password: string
  confirmPassword: string
  name: string
  acceptTerms: boolean
}

export interface AuthState {
  user: User | null
  session: AuthSession | null
  isLoading: boolean
  error: string | null
}

export interface AuthProviders {
  email: boolean
  google: boolean
  github: boolean
  microsoft: boolean
}

export interface PasswordReset {
  email: string
  token: string
  expiresAt: Date
  isUsed: boolean
}

export interface EmailVerification {
  email: string
  token: string
  expiresAt: Date
  isVerified: boolean
}

export interface LoginAttempt {
  email: string
  ipAddress: string
  userAgent: string
  success: boolean
  timestamp: Date
  failureReason?: string
}

export interface SecuritySettings {
  twoFactorEnabled: boolean
  sessionTimeout: number
  allowedIPs: string[]
  requireEmailVerification: boolean
  maxLoginAttempts: number
  lockoutDuration: number
}

export interface UserProfile {
  firstName: string
  lastName: string
  phone?: string
  company?: string
  jobTitle?: string
  timezone: string
  language: string
  notifications: NotificationSettings
}

export interface NotificationSettings {
  email: boolean
  push: boolean
  newsletter: boolean
  updates: boolean
  security: boolean
  marketing: boolean
}
