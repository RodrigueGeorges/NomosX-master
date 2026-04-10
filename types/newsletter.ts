/**
 * Types Newsletter - Types TypeScript pour les newsletters
 */

export interface Newsletter {
  id: string
  title: string
  subject: string
  content: string
  htmlContent?: string
  summary: string
  status: 'draft' | 'scheduled' | 'sent' | 'archived'
  scheduledAt?: Date
  sentAt?: Date
  createdAt: Date
  updatedAt: Date
  authorId: string
  tags: string[]
  categories: NewsletterCategory[]
  metadata: NewsletterMetadata
}

export interface NewsletterCategory {
  id: string
  name: string
  slug: string
  description: string
  color: string
  isActive: boolean
}

export interface NewsletterMetadata {
  readingTime: number
  wordCount: number
  featuredImage?: string
  sources: NewsletterSource[]
  cta?: NewsletterCTA
  socialLinks: SocialLink[]
}

export interface NewsletterSource {
  id: string
  title: string
  url: string
  type: 'article' | 'study' | 'report' | 'book'
  credibility: number
  publishedAt: Date
}

export interface NewsletterCTA {
  text: string
  url: string
  type: 'primary' | 'secondary'
  trackingId?: string
}

export interface SocialLink {
  platform: 'twitter' | 'linkedin' | 'facebook' | 'instagram'
  url: string
  text: string
}

export interface NewsletterSubscription {
  id: string
  email: string
  userId?: string
  status: 'active' | 'unsubscribed' | 'bounced'
  preferences: NewsletterPreferences
  subscribedAt: Date
  unsubscribedAt?: Date
  lastOpenedAt?: Date
  lastClickedAt?: Date
  openCount: number
  clickCount: number
}

export interface NewsletterPreferences {
  categories: string[]
  frequency: 'daily' | 'weekly' | 'monthly'
  format: 'html' | 'text' | 'both'
  personalizedContent: boolean
  promotionalEmails: boolean
}

export interface NewsletterCampaign {
  id: string
  newsletterId: string
  name: string
  subject: string;
fromEmail: string;
fromName: string
  replyTo: string
  template: string
  segments: CampaignSegment[]
  scheduledAt?: Date
  sentAt?: Date
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled'
  metrics: CampaignMetrics
  createdAt: Date
  updatedAt: Date
}

export interface CampaignSegment {
  id: string
  name: string
  criteria: SegmentCriteria
  subscriberCount: number
}

export interface SegmentCriteria {
  categories?: string[]
  plan?: ('free' | 'professional' | 'enterprise' | 'custom')[]
  activity?: 'active' | 'inactive' | 'new'
  location?: string[]
  customFields?: Record<string, any>
}

export interface CampaignMetrics {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  complained: number
  openRate: number
  clickRate: number
  bounceRate: number
  unsubscribeRate: number
}

export interface NewsletterTemplate {
  id: string
  name: string
  description: string
  html: string
  css: string
  variables: TemplateVariable[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface TemplateVariable {
  name: string
  type: 'text' | 'image' | 'link' | 'date'
  defaultValue?: string
  required: boolean
  description: string
}

export interface NewsletterAnalytics {
  period: {
    start: Date
    end: Date
  }
  totalSent: number
  totalOpened: number
  totalClicked: number
  totalUnsubscribed: number
  averageOpenRate: number
  averageClickRate: number
  topPerformingNewsletters: Newsletter[]
  subscriberGrowth: {
    new: number
    unsubscribed: number
    net: number
  }
  engagementByCategory: Record<string, {
    sent: number
    opened: number
    clicked: number
  }>
}
