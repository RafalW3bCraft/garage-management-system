import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';

interface RequestMetric {
  method: string;
  path: string;
  duration: number;
  statusCode: number;
  timestamp: number;
  isError: boolean;
}

interface EndpointStats {
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  errorRate: number;
  lastAccessed: number;
}

interface PerformanceMetrics {
  topSlowestEndpoints: Array<{
    endpoint: string;
    method: string;
    avgDuration: number;
    maxDuration: number;
    count: number;
    errorRate: number;
  }>;
  totalRequests: number;
  overallErrorRate: number;
  overallAvgResponseTime: number;
  endpointStats: Record<string, EndpointStats>;
  slowRequestCount: number;
  cacheSize: number;
  monitoringSince: number;
}

class PerformanceMonitor {
  private requestCache: LRUCache<number, RequestMetric>;
  private endpointStatsMap: Map<string, EndpointStats>;
  private monitoringStartTime: number;
  private requestCounter: number;
  private slowRequestThreshold: number;

  constructor(maxCacheSize: number = 1000, slowRequestThreshold?: number) {
    this.requestCache = new LRUCache<number, RequestMetric>({
      max: maxCacheSize,
      ttl: 1000 * 60 * 60, // 1 hour TTL
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });

    this.endpointStatsMap = new Map<string, EndpointStats>();
    this.monitoringStartTime = Date.now();
    this.requestCounter = 0;
    // Use environment variable PERF_SLOW_MS if available, otherwise use provided threshold or default 1000ms
    this.slowRequestThreshold = slowRequestThreshold ?? parseInt(process.env.PERF_SLOW_MS || '1000', 10);
  }

  /**
   * Express middleware to track request performance
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only monitor API traffic (paths starting with '/api')
      // This prevents static/Vite traffic from skewing API metrics
      if (!req.path.startsWith('/api')) {
        return next();
      }

      const startTime = Date.now();
      const endpoint = this.normalizeEndpoint(req.path);
      const method = req.method;

      // Use the 'finish' event to track when the response is complete
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const isError = statusCode >= 400;

        // Record the metric
        this.recordMetric({
          method,
          path: endpoint,
          duration,
          statusCode,
          timestamp: startTime,
          isError,
        });

        // Log slow requests
        if (duration >= this.slowRequestThreshold) {
          console.warn(`[SLOW_REQUEST] ${method} ${endpoint} ${statusCode} in ${duration}ms`);
        }
      });

      next();
    };
  }

  /**
   * Normalize endpoint path by removing IDs and dynamic segments
   */
  private normalizeEndpoint(path: string): string {
    // Replace UUIDs with :id
    let normalized = path.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id'
    );
    
    // Replace numeric IDs with :id
    normalized = normalized.replace(/\/\d+/g, '/:id');
    
    // Replace other common dynamic segments
    normalized = normalized.replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:token');

    return normalized;
  }

  /**
   * Record a request metric
   */
  private recordMetric(metric: RequestMetric): void {
    // Store in LRU cache
    this.requestCache.set(this.requestCounter++, metric);

    // Update endpoint stats
    const key = `${metric.method} ${metric.path}`;
    const existingStats = this.endpointStatsMap.get(key);

    if (existingStats) {
      existingStats.count++;
      existingStats.totalDuration += metric.duration;
      existingStats.avgDuration = existingStats.totalDuration / existingStats.count;
      existingStats.minDuration = Math.min(existingStats.minDuration, metric.duration);
      existingStats.maxDuration = Math.max(existingStats.maxDuration, metric.duration);
      existingStats.errorCount += metric.isError ? 1 : 0;
      existingStats.errorRate = (existingStats.errorCount / existingStats.count) * 100;
      existingStats.lastAccessed = metric.timestamp;
    } else {
      this.endpointStatsMap.set(key, {
        count: 1,
        totalDuration: metric.duration,
        avgDuration: metric.duration,
        minDuration: metric.duration,
        maxDuration: metric.duration,
        errorCount: metric.isError ? 1 : 0,
        errorRate: metric.isError ? 100 : 0,
        lastAccessed: metric.timestamp,
      });
    }
  }

  /**
   * Get comprehensive performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const allMetrics = Array.from(this.requestCache.values());
    const totalRequests = allMetrics.length;
    const errorCount = allMetrics.filter((m) => m.isError).length;
    const totalDuration = allMetrics.reduce((sum, m) => sum + m.duration, 0);
    const slowRequestCount = allMetrics.filter(
      (m) => m.duration >= this.slowRequestThreshold
    ).length;

    // Calculate top slowest endpoints
    const endpointArray = Array.from(this.endpointStatsMap.entries()).map(
      ([key, stats]) => {
        const [method, ...pathParts] = key.split(' ');
        const endpoint = pathParts.join(' ');
        return {
          endpoint,
          method,
          avgDuration: Math.round(stats.avgDuration * 100) / 100,
          maxDuration: stats.maxDuration,
          count: stats.count,
          errorRate: Math.round(stats.errorRate * 100) / 100,
        };
      }
    );

    // Sort by average duration and take top 10
    const topSlowestEndpoints = endpointArray
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    // Build endpoint stats object
    const endpointStats: Record<string, EndpointStats> = {};
    this.endpointStatsMap.forEach((stats, key) => {
      endpointStats[key] = {
        ...stats,
        avgDuration: Math.round(stats.avgDuration * 100) / 100,
        errorRate: Math.round(stats.errorRate * 100) / 100,
      };
    });

    return {
      topSlowestEndpoints,
      totalRequests,
      overallErrorRate: totalRequests > 0 ? Math.round((errorCount / totalRequests) * 10000) / 100 : 0,
      overallAvgResponseTime: totalRequests > 0 ? Math.round((totalDuration / totalRequests) * 100) / 100 : 0,
      endpointStats,
      slowRequestCount,
      cacheSize: this.requestCache.size,
      monitoringSince: this.monitoringStartTime,
    };
  }

  /**
   * Reset all metrics (useful for testing or manual reset)
   */
  reset(): void {
    this.requestCache.clear();
    this.endpointStatsMap.clear();
    this.monitoringStartTime = Date.now();
    this.requestCounter = 0;
    console.log('[PERFORMANCE_MONITOR] Metrics reset');
  }

  /**
   * Get current cache size
   */
  getCacheSize(): number {
    return this.requestCache.size;
  }

  /**
   * Get monitoring uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.monitoringStartTime;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor(1000, 1000);

// Export middleware function
export const performanceMiddleware = performanceMonitor.middleware.bind(performanceMonitor);

// Export metrics getter
export const getPerformanceMetrics = performanceMonitor.getMetrics.bind(performanceMonitor);
