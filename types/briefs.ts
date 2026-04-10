/**
 * Types Briefs - Types TypeScript pour les briefs
 */

export interface Brief {
  id: string
  title: string
  type: 'executive' | 'strategic'
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived'
  priority: 'low' | 'medium' | 'high' | 'critical'
  content: BriefContent
  metadata: BriefMetadata
  createdAt: Date
  updatedAt: Date
  publishedAt?: Date
  authorId: string
  reviewerId?: string
  tags: string[]
  category: BriefCategory
}

export interface BriefContent {
  executiveSummary: string
  keyFindings: string[]
  background: string
  analysis: BriefAnalysis
  recommendations: BriefRecommendation[]
  conclusion: string
  appendices?: BriefAppendix[]
}

export interface BriefAnalysis {
  situation: string
  complications: string[]
  keyQuestions: string[]
  methodology: string
  dataSources: DataSource[]
  limitations: string[]
}

export interface BriefRecommendation {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  timeline: string
  resources: string[]
  kpis: string[]
  risks: string[]
  owner?: string
}

export interface BriefAppendix {
  id: string
  title: string
  type: 'chart' | 'table' | 'document' | 'image'
  content: any
  description: string
}

export interface BriefMetadata {
  readingTime: number
  wordCount: number
  pages: number
  complexity: 'low' | 'medium' | 'high'
  sensitivity: 'public' | 'internal' | 'confidential' | 'secret'
  audience: BriefAudience
  timeframe: {
    start: Date
    end: Date
  }
  budget?: {
    estimated: number
    currency: 'EUR' | 'USD'
  }
}

export interface BriefAudience {
  primary: string[]
  secondary: string[]
  stakeholders: string[]
  decisionMakers: string[]
}

export interface BriefCategory {
  id: string
  name: string
  slug: string
  description: string
  color: string
  icon?: string
}

export interface DataSource {
  id: string
  title: string
  url?: string
  type: 'internal' | 'external' | 'survey' | 'interview' | 'report'
  credibility: number
  publishedAt?: Date
  accessedAt: Date
  notes?: string
}

export interface BriefTemplate {
  id: string
  name: string
  description: string
  type: 'executive' | 'strategic'
  sections: TemplateSection[]
  variables: TemplateVariable[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface TemplateSection {
  id: string
  title: string
  description: string
  order: number
  required: boolean
  placeholder: string
  maxLength?: number
}

export interface TemplateVariable {
  name: string
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect'
  label: string
  description: string
  required: boolean
  options?: string[]
  defaultValue?: any
}

export interface BriefReview {
  id: string
  briefId: string
  reviewerId: string
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision'
  comments: ReviewComment[]
  reviewedAt?: Date
  decision?: string
}

export interface ReviewComment {
  id: string
  section: string
  text: string
  type: 'suggestion' | 'correction' | 'question' | 'approval'
  severity: 'low' | 'medium' | 'high'
  resolved: boolean
  createdAt: Date
}

export interface BriefVersion {
  id: string
  briefId: string
  version: number
  title: string
  content: BriefContent
  changes: VersionChange[]
  createdAt: Date
  authorId: string
  notes?: string
}

export interface VersionChange {
  section: string
  type: 'added' | 'modified' | 'deleted'
  description: string
  oldValue?: string
  newValue?: string
}

export interface BriefAnalytics {
  briefId: string
  views: number
  downloads: number
  shares: number
  comments: number
  averageRating: number
  ratings: number
  readTime: {
    average: number
    median: number
    distribution: Record<string, number>
  }
  engagement: {
    bySection: Record<string, number>
    byUserType: Record<string, number>
  }
  feedback: BriefFeedback[]
}

export interface BriefFeedback {
  id: string
  briefId: string
  userId: string
  rating: number
  comment?: string
  helpful: boolean
  createdAt: Date
}

export interface BriefAccess {
  id: string
  briefId: string
  userId: string
  permission: 'read' | 'comment' | 'edit' | 'admin'
  grantedBy: string
  grantedAt: Date
  expiresAt?: Date
}
