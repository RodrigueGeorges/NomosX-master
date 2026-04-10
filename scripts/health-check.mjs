#!/usr/bin/env node

/**
 * Health Check Script
 * 
 * Monitors application health and performance metrics
 * Returns structured health status for monitoring systems
 */

import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const startTime = performance.now();

// Configuration
const config = {
  database: {
    url: process.env.DATABASE_URL,
    timeout: 5000,
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    timeout: 5000,
  },
  thresholds: {
    responseTime: 2000, // ms
    memoryUsage: 80, // %
    diskUsage: 85, // %
  },
};

// Health check results
const healthResults = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  version: process.env.npm_package_version || 'unknown',
  environment: process.env.NODE_ENV || 'development',
  checks: {},
  metrics: {
    responseTime: 0,
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
  },
};

async function checkDatabase() {
  const checkStart = performance.now();
  
  try {
    const prisma = new PrismaClient({
      datasources: {
        url: config.database.url,
      },
    });
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Get basic stats
    const [userCount, briefCount, sourceCount] = await Promise.all([
      prisma.user.count(),
      prisma.brief.count(),
      prisma.source.count(),
    ]);
    
    await prisma.$disconnect();
    
    const responseTime = performance.now() - checkStart;
    
    healthResults.checks.database = {
      status: 'healthy',
      responseTime: Math.round(responseTime),
      details: {
        userCount,
        briefCount,
        sourceCount,
      }
    };
    
    return true;
  } catch (error) {
    healthResults.checks.database = {
      status: 'unhealthy',
      error: error.message,
      responseTime: Math.round(performance.now() - checkStart),
    };
    
    return false;
  }
}

async function checkSupabase() {
  const checkStart = performance.now();
  
  try {
    const supabase = createClient(
      config.supabase.url,
      config.supabase.key
    );
    
    // Test Supabase connection
    const { error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    const responseTime = performance.now() - checkStart;
    
    if (error) {
      throw error;
    }
    
    healthResults.checks.supabase = {
      status: 'healthy',
      responseTime: Math.round(responseTime),
    };
    
    return true;
  } catch (error) {
    healthResults.checks.supabase = {
      status: 'unhealthy',
      error: error.message,
      responseTime: Math.round(performance.now() - checkStart),
    };
    
    return false;
  }
}

async function checkMemory() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  
  const isHealthy = heapUsagePercent < config.thresholds.memoryUsage;
  
  healthResults.checks.memory = {
    status: isHealthy ? 'healthy' : 'warning',
    heapUsedMB,
    heapTotalMB,
    heapUsagePercent,
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
  };
  
  return isHealthy;
}

async function checkDiskSpace() {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const stats = fs.statSync(process.cwd());
    const freeSpace = stats.free || 0;
    const totalSpace = stats.size || 0;
    const usagePercent = totalSpace > 0 ? Math.round(((totalSpace - freeSpace) / totalSpace) * 100) : 0;
    
    const isHealthy = usagePercent < config.thresholds.diskUsage;
    
    healthResults.checks.disk = {
      status: isHealthy ? 'healthy' : 'warning',
      usagePercent,
      freeSpace: Math.round(freeSpace / 1024 / 1024 / 1024), // GB
      totalSpace: Math.round(totalSpace / 1024 / 1024 / 1024), // GB
    };
    
    return isHealthy;
  } catch (error) {
    healthResults.checks.disk = {
      status: 'unknown',
      error: error.message,
    };
    
    return true; // Don't fail health check for disk issues
  }
}

async function checkAPIEndpoints() {
  const endpoints = [
    '/api/health',
    '/api/auth/me',
    '/api/subscription/status',
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      results.push({
        endpoint,
        status: response.ok ? 'healthy' : 'unhealthy',
        statusCode: response.status,
      });
    } catch (error) {
      results.push({
        endpoint,
        status: 'unhealthy',
        error: error.message,
      });
    }
  }
  
  const healthyCount = results.filter(r => r.status === 'healthy').length;
  const isHealthy = healthyCount === endpoints.length;
  
  healthResults.checks.api = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    endpoints: results,
    healthyCount,
    total: endpoints.length,
  };
  
  return isHealthy;
}

function calculateOverallHealth() {
  const checks = healthResults.checks;
  const checkValues = Object.values(checks);
  
  const healthyCount = checkValues.filter(check => check.status === 'healthy').length;
  const totalCount = checkValues.length;
  const warningCount = checkValues.filter(check => check.status === 'warning').length;
  
  if (healthyCount === totalCount) {
    healthResults.status = 'healthy';
  } else if (warningCount > 0) {
    healthResults.status = 'warning';
  } else {
    healthResults.status = 'unhealthy';
  }
  
  healthResults.summary = {
    total: totalCount,
    healthy: healthyCount,
    warning: warningCount,
    unhealthy: totalCount - healthyCount - warningCount,
  };
}

async function main() {
  console.log('🔍 Starting NomosX Health Check...\n');
  
  // Run all health checks
  await Promise.all([
    checkDatabase(),
    checkSupabase(),
    checkMemory(),
    checkDiskSpace(),
    checkAPIEndpoints(),
  ]);
  
  // Calculate overall health
  calculateOverallHealth();
  
  // Calculate total response time
  healthResults.metrics.responseTime = Math.round(performance.now() - startTime);
  
  // Output results
  console.log('📊 Health Check Results:');
  console.log('========================');
  console.log(`Status: ${healthResults.status.toUpperCase()}`);
  console.log(`Response Time: ${healthResults.metrics.responseTime}ms`);
  console.log(`Uptime: ${Math.round(healthResults.uptime)}s`);
  console.log(`Environment: ${healthResults.environment}`);
  console.log(`Version: ${healthResults.version}`);
  
  console.log('\n📋 Check Summary:');
  console.log(`Total: ${healthResults.summary.total}`);
  console.log(`✅ Healthy: ${healthResults.summary.healthy}`);
  console.log(`⚠️  Warning: ${healthResults.summary.warning}`);
  console.log(`❌ Unhealthy: ${healthResults.summary.unhealthy}`);
  
  console.log('\n🔍 Detailed Checks:');
  Object.entries(healthResults.checks).forEach(([name, check]) => {
    const icon = check.status === 'healthy' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
    console.log(`${icon} ${name}: ${check.status}`);
    
    if (check.responseTime) {
      console.log(`   Response Time: ${check.responseTime}ms`);
    }
    
    if (check.error) {
      console.log(`   Error: ${check.error}`);
    }
  });
  
  console.log('\n💾 Memory Usage:');
  const mem = healthResults.metrics.memoryUsage;
  console.log(`Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
  console.log(`Heap Total: ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
  console.log(`RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
  
  // Exit with appropriate code
  const exitCode = healthResults.status === 'healthy' ? 0 : 
                   healthResults.status === 'warning' ? 1 : 2;
  
  console.log(`\n🏁 Health Check Complete (Exit Code: ${exitCode})`);
  
  // Output JSON for monitoring systems
  if (process.argv.includes('--json')) {
    console.log('\n📄 JSON Output:');
    console.log(JSON.stringify(healthResults, null, 2));
  }
  
  process.exit(exitCode);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(2);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(2);
});

// Run health check
main().catch(error => {
  console.error('❌ Health check failed:', error);
  process.exit(2);
});
