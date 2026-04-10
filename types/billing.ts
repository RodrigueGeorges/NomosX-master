/**
 * Types Billing - Types TypeScript pour la facturation
 */

export interface BillingPlan {
  id: string
  name: string
  description: string
  price: number
  currency: 'EUR' | 'USD'
  interval: 'month' | 'year'
  features: BillingFeature[]
  limits: BillingLimits
  stripePriceId?: string
  isActive: boolean
  sortOrder: number
}

export interface BillingFeature {
  id: string
  name: string
  description: string
  included: boolean
  limit?: number
  icon?: string
}

export interface BillingLimits {
  newsletters: number
  briefs: number
  storage: number // en MB
  apiCalls: number
  teamMembers: number
  customDomains: number
}

export interface Subscription {
  id: string
  userId: string
  planId: string
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEnd?: Date
  cancelAtPeriodEnd: boolean
  stripeSubscriptionId?: string
  createdAt: Date
  updatedAt: Date
}

export interface Invoice {
  id: string
  userId: string
  subscriptionId: string
  number: string
  amount: number
  currency: 'EUR' | 'USD'
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  dueDate: Date
  paidAt?: Date
  stripeInvoiceId?: string
  pdfUrl?: string
  items: InvoiceItem[]
  createdAt: Date
  updatedAt: Date
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  period: {
    start: Date
    end: Date
  }
}

export interface PaymentMethod {
  id: string
  userId: string
  type: 'card' | 'bank_account'
  brand?: string // Visa, Mastercard, etc.
  last4?: string
  expiryMonth?: number
  expiryYear?: number
  isDefault: boolean
  stripePaymentMethodId?: string
  createdAt: Date
  updatedAt: Date
}

export interface Usage {
  id: string
  userId: string
  period: {
    start: Date
    end: Date
  }
  metrics: {
    newsletters: number
    briefs: number
    storage: number
    apiCalls: number
  }
  createdAt: Date
  updatedAt: Date
}

export interface BillingSettings {
  userId: string
  taxId?: string
  billingAddress?: BillingAddress
  autoRenew: boolean
  invoiceEmail: string
  ccEmails: string[]
  purchaseOrders: boolean
  netTerms: number
}

export interface BillingAddress {
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export interface BillingEvent {
  id: string
  userId: string
  type: 'subscription_created' | 'subscription_updated' | 'subscription_canceled' | 'payment_succeeded' | 'payment_failed'
  data: any
  createdAt: Date
}

export interface BillingAnalytics {
  revenue: {
    monthly: number
    yearly: number
    total: number
  }
  subscriptions: {
    active: number
    canceled: number
    trialing: number
  }
  churn: {
    rate: number
    monthly: number
  }
  arpu: number // Average Revenue Per User
  ltv: number // Lifetime Value
}
