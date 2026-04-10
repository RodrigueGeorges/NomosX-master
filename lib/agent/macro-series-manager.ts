/**
 * NomosX Macro Series Manager
 * 
 * Enterprise-grade macro data refresh and management system
 * Implements professional architecture patterns with proper error handling
 * 
 * @author NomosX Team
 * @version 2.0.0
 * @since 2026-02-24
 */

import { prisma } from '../db';

// ============================================================================
// PROFESSIONAL TYPE DEFINITIONS
// ============================================================================

/**
 * Macro Series interface matching Prisma schema
 * Ensures type safety across the application
 */
export interface MacroSeries {
  id: string;
  provider: string;
  code: string;
  name: string;
  description: string | null;
  unit: string | null;
  frequency: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Macro Data Point interface
 * Represents individual data points in time series
 */
export interface MacroPoint {
  id: string;
  seriesId: string;
  date: Date;
  value: number;
  createdAt: Date;
}

/**
 * Refresh operation result
 * Provides comprehensive feedback on refresh operations
 */
export interface RefreshResult {
  success: boolean;
  seriesUpdated: number;
  dataPointsAdded: number;
  errors: string[];
  duration: number;
  metadata?: {
    categories: Record<string, number>;
    providers: Record<string, number>;
  };
}

/**
 * Macro series health metrics
 * Used for monitoring and alerting
 */
export interface MacroHealthMetrics {
  totalSeries: number;
  activeSeries: number;
  staleSeries: number;
  lastRefresh: Date | null;
  providers: Record<string, number>;
  averageDataPoints: number;
}

// ============================================================================
// ENTERPRISE-GRADE REFRESH FUNCTIONS
// ============================================================================

/**
 * Refresh macro series with professional error handling and monitoring
 * 
 * @param options - Configuration options for refresh operation
 * @returns Promise<RefreshResult> - Comprehensive operation result
 */
export async function refreshMacroSeries(
  options: { 
    providers?: string[]; 
    forceRefresh?: boolean;
    maxAgeHours?: number;
    batchSize?: number;
  } = {}
): Promise<RefreshResult> {
  const startTime = Date.now();
  const maxAge = options.maxAgeHours || 24;
  const batchSize = options.batchSize || 10;
  const errors: string[] = [];
  let seriesUpdated = 0;
  let dataPointsAdded = 0;
  const providers: Record<string, number> = {};

  console.log(`[MACRO_REFRESH] Starting enterprise refresh process...`);
  console.log(`[MACRO_REFRESH] Options:`, JSON.stringify(options, null, 2));

  try {
    // Build query with professional filtering
    const whereClause: any = {};
    
    if (options.providers?.length) {
      whereClause.provider = { in: options.providers };
    }

    if (!options.forceRefresh) {
      const staleDate = new Date(Date.now() - maxAge * 60 * 60 * 1000);
      whereClause.updatedAt = { lt: staleDate };
    }

    // Execute query with proper error handling
    const seriesToUpdate = await prisma.macroSeries.findMany({
      where: whereClause,
      take: 100, // Prevent memory issues
      orderBy: { updatedAt: 'asc' }
    });

    console.log(`[MACRO_REFRESH] Found ${seriesToUpdate.length} series to update`);

    if (seriesToUpdate.length === 0) {
      const duration = Date.now() - startTime;
      return {
        success: true,
        seriesUpdated: 0,
        dataPointsAdded: 0,
        errors: [],
        duration,
        metadata: {
          categories: {},
          providers
        }
      };
    }

    // Process in batches for performance
    for (let i = 0; i < seriesToUpdate.length; i += batchSize) {
      const batch = seriesToUpdate.slice(i, i + batchSize);
      
      console.log(`[MACRO_REFRESH] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(seriesToUpdate.length/batchSize)}`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (series) => {
        try {
          const result = await refreshSingleSeries(series);
          
          if (result.success) {
            seriesUpdated++;
            dataPointsAdded += result.dataPointsAdded;
            providers[series.provider] = (providers[series.provider] || 0) + 1;
          } else {
            errors.push(...result.errors);
          }
          
          return result;
        } catch (error) {
          const errorMsg = `Batch processing failed for ${series.name}: ${(error as Error).message}`;
          errors.push(errorMsg);
          console.error(`[MACRO_REFRESH] ${errorMsg}`);
          
          return { success: false, dataPointsAdded: 0, errors: [errorMsg] };
        }
      });

      await Promise.allSettled(batchPromises);
      
      // Add delay between batches to prevent rate limiting
      if (i + batchSize < seriesToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    const success = errors.length === 0;

    console.log(`[MACRO_REFRESH] Enterprise refresh completed:`);
    console.log(`  • Status: ${success ? 'SUCCESS' : 'PARTIAL'}`);
    console.log(`  • Series Updated: ${seriesUpdated}`);
    console.log(`  • Data Points Added: ${dataPointsAdded}`);
    console.log(`  • Errors: ${errors.length}`);
    console.log(`  • Duration: ${duration}ms`);

    return {
      success,
      seriesUpdated,
      dataPointsAdded,
      errors,
      duration,
      metadata: {
        categories: {},
        providers
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = `Enterprise macro refresh failed: ${(error as Error).message}`;
    console.error(`[MACRO_REFRESH] ${errorMsg}`);
    
    return {
      success: false,
      seriesUpdated: 0,
      dataPointsAdded: 0,
      errors: [errorMsg],
      duration
    };
  }
}

/**
 * Refresh a single macro series with professional data validation
 * 
 * @param series - Macro series to refresh
 * @returns Promise with operation result
 */
async function refreshSingleSeries(series: MacroSeries): Promise<{
  success: boolean;
  dataPointsAdded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let dataPointsAdded = 0;

  try {
    console.log(`[MACRO_REFRESH] Refreshing series: ${series.provider}:${series.code}`);

    // Get latest data point for this series
    const latestPoint = await prisma.macroPoint.findFirst({
      where: { seriesId: series.id },
      orderBy: { date: 'desc' }
    });

    const startDate = latestPoint ? new Date(latestPoint.date) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    // Fetch new data (placeholder implementation)
    const newData = await fetchMacroDataFromProvider(series, startDate, endDate);

    if (newData.length > 0) {
      // Validate data before insertion
      const validData = newData.filter(point => 
        point.date && 
        typeof point.value === 'number' && 
        !isNaN(point.value) &&
        point.value >= 0 // Basic validation
      );

      if (validData.length > 0) {
        // Insert data in transaction for consistency
        await prisma.$transaction(async (tx) => {
          await tx.macroPoint.createMany({
            data: validData.map(point => ({
              seriesId: series.id,
              date: point.date,
              value: point.value
            })),
            skipDuplicates: true
          });

          // Update series timestamp
          await tx.macroSeries.update({
            where: { id: series.id },
            data: { updatedAt: new Date() }
          });
        });

        dataPointsAdded = validData.length;
        console.log(`[MACRO_REFRESH] Added ${dataPointsAdded} valid points for ${series.name}`);
      } else {
        errors.push(`No valid data points for ${series.name}`);
      }
    } else {
      console.log(`[MACRO_REFRESH] No new data available for ${series.name}`);
    }

    return {
      success: errors.length === 0,
      dataPointsAdded,
      errors
    };

  } catch (error) {
    const errorMsg = `Failed to refresh ${series.name}: ${(error as Error).message}`;
    errors.push(errorMsg);
    console.error(`[MACRO_REFRESH] ${errorMsg}`);
    
    return {
      success: false,
      dataPointsAdded: 0,
      errors
    };
  }
}

/**
 * Fetch macro data from external provider
 * Professional implementation with proper error handling
 * 
 * @param series - Macro series configuration
 * @param startDate - Start date for data fetch
 * @param endDate - End date for data fetch
 * @returns Promise<Array of data points>
 */
async function fetchMacroDataFromProvider(
  series: MacroSeries,
  startDate: Date,
  endDate: Date
): Promise<Array<{
  date: Date;
  value: number;
}>> {
  console.log(`[MACRO_FETCH] Fetching data for ${series.provider}:${series.code}`);
  console.log(`[MACRO_FETCH] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Professional data fetching implementation
  // This would integrate with real providers like:
  // - FRED (Federal Reserve Economic Data)
  // - World Bank Open Data
  // - OECD Statistics
  // - IMF Data
  // - Yahoo Finance API
  
  try {
    // Placeholder implementation
    // In production, this would make actual API calls
    switch (series.provider.toLowerCase()) {
      case 'fred':
        return await fetchFromFRED(series.code, startDate, endDate);
      case 'worldbank':
        return await fetchFromWorldBank(series.code, startDate, endDate);
      case 'oecd':
        return await fetchFromOECD(series.code, startDate, endDate);
      default:
        console.warn(`[MACRO_FETCH] Unknown provider: ${series.provider}`);
        return [];
    }
  } catch (error) {
    console.error(`[MACRO_FETCH] Error fetching from ${series.provider}:`, error);
    return [];
  }
}

/**
 * Placeholder implementations for specific providers
 * These would be implemented with actual API integrations
 */
async function fetchFromFRED(code: string, startDate: Date, endDate: Date): Promise<any[]> {
  // TODO: Implement FRED API integration
  console.log(`[FRED] Fetching series ${code} from ${startDate} to ${endDate}`);
  return [];
}

async function fetchFromWorldBank(code: string, startDate: Date, endDate: Date): Promise<any[]> {
  // TODO: Implement World Bank API integration
  console.log(`[WORLDBANK] Fetching indicator ${code} from ${startDate} to ${endDate}`);
  return [];
}

async function fetchFromOECD(code: string, startDate: Date, endDate: Date): Promise<any[]> {
  // TODO: Implement OECD API integration
  console.log(`[OECD] Fetching series ${code} from ${startDate} to ${endDate}`);
  return [];
}

/**
 * Get comprehensive macro series health metrics
 * Used for monitoring and alerting systems
 */
export async function getMacroSeriesHealth(): Promise<MacroHealthMetrics> {
  try {
    const [totalSeries, recentSeries, staleSeries] = await Promise.all([
      prisma.macroSeries.count(),
      prisma.macroSeries.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours
          }
        }
      }),
      prisma.macroSeries.count({
        where: {
          updatedAt: {
            lt: new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours
          }
        }
      })
    ]);

    const lastRefreshSeries = await prisma.macroSeries.findFirst({
      orderBy: { updatedAt: 'desc' }
    });

    const providerStats = await prisma.macroSeries.groupBy({
      by: ['provider'],
      _count: true
    });

    const providers = providerStats.reduce((acc, stat) => {
      acc[stat.provider] = stat._count;
      return acc;
    }, {} as Record<string, number>);

    const averageDataPoints = await prisma.macroPoint.groupBy({
      by: ['seriesId'],
      _count: true
    }).then(results => {
      if (results.length === 0) return 0;
      const total = results.reduce((sum, r) => sum + r._count, 0);
      return Math.round(total / results.length);
    });

    return {
      totalSeries,
      activeSeries: recentSeries,
      staleSeries,
      lastRefresh: lastRefreshSeries?.updatedAt || null,
      providers,
      averageDataPoints
    };

  } catch (error) {
    console.error('[MACRO_HEALTH] Error getting health metrics:', error);
    return {
      totalSeries: 0,
      activeSeries: 0,
      staleSeries: 0,
      lastRefresh: null,
      providers: {},
      averageDataPoints: 0
    };
  }
}

/**
 * Get macro data for analysis with proper validation
 * 
 * @param seriesIds - Array of series IDs to fetch
 * @param startDate - Start date for data
 * @param endDate - End date for data
 * @returns Promise with series and data points
 */
export async function getMacroDataForAnalysis(
  seriesIds: string[],
  startDate: Date,
  endDate: Date
): Promise<Array<{
  series: MacroSeries;
  dataPoints: MacroPoint[];
}>> {
  try {
    const series = await prisma.macroSeries.findMany({
      where: { id: { in: seriesIds } }
    });

    const results = await Promise.all(
      series.map(async (s) => {
        const dataPoints = await prisma.macroPoint.findMany({
          where: {
            seriesId: s.id,
            date: { gte: startDate, lte: endDate }
          },
          orderBy: { date: 'asc' }
        });

        return {
          series: s,
          dataPoints
        };
      })
    );

    return results;

  } catch (error) {
    console.error('[MACRO_ANALYSIS] Error getting data for analysis:', error);
    return [];
  }
}

/**
 * Create or update macro series with professional validation
 * 
 * @param data - Series data to upsert
 * @returns Promise with created/updated series
 */
export async function upsertMacroSeries(
  data: Omit<MacroSeries, 'id' | 'createdAt' | 'updatedAt'>
): Promise<MacroSeries> {
  try {
    const result = await prisma.macroSeries.upsert({
      where: { 
        provider_code: {
          provider: data.provider,
          code: data.code
        }
      },
      update: {
        name: data.name,
        description: data.description,
        unit: data.unit,
        frequency: data.frequency
      },
      create: {
        provider: data.provider,
        code: data.code,
        name: data.name,
        description: data.description,
        unit: data.unit,
        frequency: data.frequency
      }
    });

    console.log(`[MACRO_UPSERT] ${result.id ? 'Updated' : 'Created'} series: ${data.provider}:${data.code}`);
    
    return result;

  } catch (error) {
    console.error('[MACRO_UPSERT] Error upserting series:', error);
    throw new Error(`Failed to upsert macro series: ${(error as Error).message}`);
  }
}
