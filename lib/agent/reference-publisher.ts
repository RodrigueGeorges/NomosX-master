/**
 * REFERENCE PUBLISHER - Living Documents System
 * 
 * Creates and manages authoritative "source of truth" publications
 * with continuous updates and versioning
 */

import { prisma } from '../db';
import { omegaVerificationEngine, OmegaVerificationRequest } from './omega-verification';

// ============================================================================
// REFERENCE PUBLICATION TYPES
// ============================================================================

export interface ReferencePublication {
  id: string;
  title: string;
  content: string;
  type: 'REFERENCE_BRIEF' | 'STRATEGIC_ANALYSIS' | 'FACT_CHECK_REPORT';
  status: 'DRAFT' | 'UNDER_REVIEW' | 'PUBLISHED' | 'UPDATED';
  version: number;
  sources: ReferenceSource[];
  citations: ReferenceCitation[];
  updateHistory: UpdateHistory[];
  usageStats: UsageStats;
  verificationResult?: any;
  lastUpdated: Date;
  nextReviewDate: Date;
}

export interface ReferenceSource {
  id: string;
  title: string;
  provider: string;
  authors: string[];
  year?: number;
  doi?: string;
  url?: string;
  qualityScore: number;
  relevanceScore: number;
  trustScore: number;
}

export interface ReferenceCitation {
  id: string;
  sourceId: string;
  location: string; // Where in content it's cited
  context: string;
  confidence: number;
  verified: boolean;
}

export interface UpdateHistory {
  version: number;
  timestamp: Date;
  changes: string[];
  reason: string;
  author: string;
  impact: 'MINOR' | 'MODERATE' | 'MAJOR';
}

export interface UsageStats {
  views: number;
  citations: number;
  downloads: number;
  shares: number;
  lastAccessed: Date;
  userFeedback: {
    rating: number;
    comments: string[];
  };
}

// ============================================================================
// REFERENCE PUBLISHER ENGINE
// ============================================================================

/**
 * Reference Publisher - Creates authoritative living documents
 */
export async function referencePublisher(
  publication: Omit<ReferencePublication, 'id' | 'version' | 'updateHistory' | 'usageStats' | 'lastUpdated' | 'nextReviewDate'>
): Promise<ReferencePublication> {
  console.log(`[REFERENCE_PUBLISHER] Creating ${publication.type}: ${publication.title}`);
  
  try {
    // Step 1: Omega Verification
    const verificationRequest: OmegaVerificationRequest = {
      content: publication.content,
      sources: publication.sources,
      verificationLevel: publication.type === 'FACT_CHECK_REPORT' ? 'COMPREHENSIVE' : 'ENHANCED',
      requireExpertValidation: true
    };
    
    const verificationResult = await omegaVerificationEngine(verificationRequest);
    
    // Step 2: Create initial publication
    const now = new Date();
    const referencePub: ReferencePublication = {
      ...publication,
      id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      version: 1,
      updateHistory: [{
        version: 1,
        timestamp: now,
        changes: ['Initial publication'],
        reason: 'Original publication',
        author: 'NomosX System',
        impact: 'MAJOR'
      }],
      usageStats: {
        views: 0,
        citations: 0,
        downloads: 0,
        shares: 0,
        lastAccessed: now,
        userFeedback: {
          rating: 0,
          comments: []
        }
      },
      verificationResult,
      lastUpdated: now,
      nextReviewDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
    
    // Step 3: Determine status based on verification
    if (verificationResult.overallScore >= 90) {
      referencePub.status = 'PUBLISHED';
    } else if (verificationResult.overallScore >= 70) {
      referencePub.status = 'UNDER_REVIEW';
    } else {
      referencePub.status = 'DRAFT';
    }
    
    // Step 4: Store in database (if available)
    try {
      await storeReferencePublication(referencePub);
    } catch (error) {
      console.warn('[REFERENCE_PUBLISHER] Database storage failed:', error);
    }
    
    console.log(`[REFERENCE_PUBLISHER] Created: ${referencePub.id} (Score: ${verificationResult.overallScore}/100)`);
    
    return referencePub;
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Publication failed:', error);
    throw error;
  }
}

/**
 * Update existing reference publication
 */
export async function updateReferencePublication(
  publicationId: string,
  updates: Partial<ReferencePublication>,
  reason: string,
  author: string = 'NomosX System'
): Promise<ReferencePublication> {
  console.log(`[REFERENCE_PUBLISHER] Updating ${publicationId}: ${reason}`);
  
  try {
    // Get existing publication
    const existing = await getReferencePublication(publicationId);
    if (!existing) {
      throw new Error(`Reference publication not found: ${publicationId}`);
    }
    
    // Create new version
    const newVersion = existing.version + 1;
    const now = new Date();
    
    // Determine impact level
    const impact = determineUpdateImpact(existing, updates);
    
    // Apply updates
    const updated: ReferencePublication = {
      ...existing,
      ...updates,
      version: newVersion,
      updateHistory: [
        ...existing.updateHistory,
        {
          version: newVersion,
          timestamp: now,
          changes: Object.keys(updates),
          reason,
          author,
          impact
        }
      ],
      lastUpdated: now,
      nextReviewDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    };
    
    // Re-verify if content changed
    if (updates.content || updates.sources) {
      const verificationRequest: OmegaVerificationRequest = {
        content: updated.content,
        sources: updated.sources,
        verificationLevel: 'ENHANCED',
        requireExpertValidation: true
      };
      
      updated.verificationResult = await omegaVerificationEngine(verificationRequest);
      
      // Update status based on new verification
      if (updated.verificationResult.overallScore >= 90) {
        updated.status = 'PUBLISHED';
      } else if (updated.verificationResult.overallScore >= 70) {
        updated.status = 'UNDER_REVIEW';
      } else {
        updated.status = 'DRAFT';
      }
    }
    
    // Store updated version
    await storeReferencePublication(updated);
    
    console.log(`[REFERENCE_PUBLISHER] Updated: ${publicationId} → v${newVersion}`);
    
    return updated;
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Update failed:', error);
    throw error;
  }
}

/**
 * Get reference publication by ID
 */
export async function getReferencePublication(
  publicationId: string
): Promise<ReferencePublication | null> {
  try {
    // Try database first
    const dbResult = await prisma.brief.findFirst({
      where: { id: publicationId }
    });
    
    if (dbResult) {
      // Convert DB result to ReferencePublication format
      return convertDbToReference(dbResult);
    }
    
    // Fallback to memory/file storage
    return null; // Implement as needed
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Get failed:', error);
    return null;
  }
}

/**
 * Search reference publications
 */
export async function searchReferencePublications(
  query: string,
  filters?: {
    type?: string;
    status?: string;
    minScore?: number;
    dateRange?: { start: Date; end: Date };
  }
): Promise<ReferencePublication[]> {
  try {
    const dbResults = await prisma.brief.findMany({
      where: {
        ...(filters?.type && { kind: filters.type.toLowerCase() }),
        ...(filters?.status && { 
          // Map status to DB fields if needed
        }),
        ...(filters?.dateRange && {
          createdAt: {
            gte: filters.dateRange.start,
            lte: filters.dateRange.end
          }
        })
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    const publications = dbResults
      .map(convertDbToReference)
      .filter(pub => pub !== null)
      .filter(pub => {
        if (filters?.minScore && pub.verificationResult) {
          return pub.verificationResult.overallScore >= filters.minScore;
        }
        return true;
      });
    
    // Filter by query text
    if (query) {
      const queryLower = query.toLowerCase();
      return publications.filter(pub => 
        pub.title.toLowerCase().includes(queryLower) ||
        pub.content.toLowerCase().includes(queryLower)
      );
    }
    
    return publications;
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Search failed:', error);
    return [];
  }
}

/**
 * Update usage statistics
 */
export async function updateUsageStats(
  publicationId: string,
  action: 'view' | 'download' | 'share' | 'cite',
  metadata?: { rating?: number; comment?: string }
): Promise<void> {
  try {
    const publication = await getReferencePublication(publicationId);
    if (!publication) return;
    
    const updatedStats = { ...publication.usageStats };
    
    switch (action) {
      case 'view':
        updatedStats.views++;
        updatedStats.lastAccessed = new Date();
        break;
      case 'download':
        updatedStats.downloads++;
        break;
      case 'share':
        updatedStats.shares++;
        break;
      case 'cite':
        updatedStats.citations++;
        break;
    }
    
    if (metadata?.rating) {
      updatedStats.userFeedback.rating = metadata.rating;
    }
    if (metadata?.comment) {
      updatedStats.userFeedback.comments.push(metadata.comment);
    }
    
    await updateReferencePublication(publicationId, {
      usageStats: updatedStats
    }, 'Usage statistics updated');
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Usage stats update failed:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Store reference publication in database
 */
async function storeReferencePublication(publication: ReferencePublication): Promise<void> {
  try {
    // Convert to DB format and store
    const dbData = {
      id: publication.id,
      kind: publication.type.toLowerCase(),
      question: publication.title,
      html: publication.content,
      sources: publication.sources.map(s => s.id),
      lineage: JSON.stringify({
        verification: publication.verificationResult,
        usageStats: publication.usageStats,
        updateHistory: publication.updateHistory
      }),
      publicId: null,
      createdAt: publication.lastUpdated,
      updatedAt: publication.lastUpdated
    };
    
    await prisma.brief.upsert({
      where: { id: publication.id },
      create: dbData,
      update: dbData
    });
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Store failed:', error);
    throw error;
  }
}

/**
 * Convert DB result to ReferencePublication format
 */
function convertDbToReference(dbResult: any): ReferencePublication | null {
  try {
    const lineage = dbResult.lineage || {};
    
    return {
      id: dbResult.id,
      title: dbResult.question,
      content: dbResult.html,
      type: dbResult.kind.toUpperCase() as any,
      status: 'PUBLISHED', // Default status
      version: 1,
      sources: [], // Would need to be populated from source IDs
      citations: [],
      updateHistory: lineage.updateHistory || [],
      usageStats: lineage.usageStats || {
        views: 0,
        citations: 0,
        downloads: 0,
        shares: 0,
        lastAccessed: new Date(),
        userFeedback: { rating: 0, comments: [] }
      },
      verificationResult: lineage.verification,
      lastUpdated: dbResult.updatedAt || dbResult.createdAt,
      nextReviewDate: new Date((dbResult.updatedAt || dbResult.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    };
    
  } catch (error) {
    console.error('[REFERENCE_PUBLISHER] Conversion failed:', error);
    return null;
  }
}

/**
 * Determine update impact level
 */
function determineUpdateImpact(
  existing: ReferencePublication,
  updates: Partial<ReferencePublication>
): 'MINOR' | 'MODERATE' | 'MAJOR' {
  if (updates.content && updates.content !== existing.content) {
    return 'MAJOR';
  }
  if (updates.sources && updates.sources.length !== existing.sources.length) {
    return 'MODERATE';
  }
  if (updates.title && updates.title !== existing.title) {
    return 'MODERATE';
  }
  return 'MINOR';
}
