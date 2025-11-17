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
      ttl: 1000 * 60 * 60,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });

    this.endpointStatsMap = new Map<string, EndpointStats>();
    this.monitoringStartTime = Date.now();
    this.requestCounter = 0;

    this.slowRequestThreshold = slowRequestThreshold ?? parseInt(process.env.PERF_SLOW_MS || '1000', 10);
  }

  

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {

      if (!req.path.startsWith('/api')) {
        return next();
      }

      const startTime = Date.now();
      const endpoint = this.normalizeEndpoint(req.path);
      const method = req.method;

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const isError = statusCode >= 400;

        this.recordMetric({
          method,
          path: endpoint,
          duration,
          statusCode,
          timestamp: startTime,
          isError,
        });

        if (duration >= this.slowRequestThreshold) {
          console.warn(`[SLOW_REQUEST] ${method} ${endpoint} ${statusCode} in ${duration}ms`);
        }
      });

      next();
    };
  }

  

  private normalizeEndpoint(path: string): string {

    let normalized = path.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id'
    );

    normalized = normalized.replace(/\/\d+/g, '/:id');

    normalized = normalized.replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:token');

    return normalized;
  }

  

  private recordMetric(metric: RequestMetric): void {

    this.requestCache.set(this.requestCounter++, metric);

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

  

  getMetrics(): PerformanceMetrics {
    const allMetrics = Array.from(this.requestCache.values());
    const totalRequests = allMetrics.length;
    const errorCount = allMetrics.filter((m) => m.isError).length;
    const totalDuration = allMetrics.reduce((sum, m) => sum + m.duration, 0);
    const slowRequestCount = allMetrics.filter(
      (m) => m.duration >= this.slowRequestThreshold
    ).length;

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

    const topSlowestEndpoints = endpointArray
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

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

  

  reset(): void {
    this.requestCache.clear();
    this.endpointStatsMap.clear();
    this.monitoringStartTime = Date.now();
    this.requestCounter = 0;
  }

  

  getCacheSize(): number {
    return this.requestCache.size;
  }

  

  getUptime(): number {
    return Date.now() - this.monitoringStartTime;
  }
}

export const performanceMonitor = new PerformanceMonitor(1000, 1000);

export const performanceMiddleware = performanceMonitor.middleware.bind(performanceMonitor);

export const getPerformanceMetrics = performanceMonitor.getMetrics.bind(performanceMonitor);
