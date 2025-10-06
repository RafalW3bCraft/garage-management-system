import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import express from "express";
import { getStorage, type CarFilterOptions } from "./storage";
import { 
  insertServiceSchema,
  insertAppointmentSchema,
  insertCarSchema,
  insertCarImageSchema,
  insertCustomerSchema,
  insertContactSchema,
  insertLocationSchema,
  registerSchema,
  serverRegisterSchema,
  loginSchema,
  rescheduleAppointmentSchema,
  placeBidSchema,
  mobileRegisterSchema,
  verifyOtpSchema,
  sendOtpSchema,
  updateProfileSchema,
  updateContactSchema,
  whatsappConfirmationSchema,
  whatsappStatusUpdateSchema,
  whatsappBidNotificationSchema,
  whatsappWebhookSchema,
  type User
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { hashPassword, verifyPassword, passport } from "./auth";
import { EmailNotificationService } from "./email-service";
import { OTPService } from "./otp-service";
import { WhatsAppService } from "./whatsapp-service";
import { ImageService, profileUpload, carUpload, IMAGE_CONFIG } from "./image-service";
import { getPerformanceMetrics } from "./performance-monitor";
import { 
  sendSuccess, 
  sendError, 
  sendValidationError, 
  sendNotFoundError, 
  sendUnauthorizedError, 
  sendForbiddenError, 
  sendConflictError, 
  sendRateLimitError,
  sendDatabaseError,
  sendResourceCreated,
  sendResourceUpdated,
  sendResourceDeleted,
  sendPaginatedResponse,
  createSuccessResponse,
  createErrorResponse
} from "./response-utils";
import path from "path";
import crypto from 'crypto';
import memoizee from 'memoizee';

// Extend Express Request to include user from Passport
declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string | null;
      name: string;
      role: string;
      phone?: string | null;
      countryCode?: string | null;
      password?: string | null;
      [key: string]: unknown;
    }
  }
}

// Extend session types for OAuth state parameter and tracking
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    createdAt?: number;
    lastIP?: string;
    lastActivity?: number;
  }
}

// Type for admin request context
interface AdminContext {
  action: string;
  resource: string;
  adminUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}

// Extend Express Request to include admin context
declare global {
  namespace Express {
    interface Request {
      adminContext?: AdminContext;
    }
  }
}

// Centralized error handling types
interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

// Custom error type with status code
interface AppError extends Error {
  status?: number;
  code?: string;
  errors?: string[];
}

// Handler function type
type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

// Cache statistics interface
interface CacheStats {
  services: {
    bulk: number;
    individual: number;
    categories: number;
  };
  locations: {
    bulk: number;
    individual: number;
  };
  cars: {
    bulk: number;
    individual: number;
  };
  appointments: number;
  users: number;
  performance: {
    totalEntries: number;
    hits: number;
    misses: number;
    hitRate: string;
    totalOperations: number;
  };
  timestamp: string;
}

// User update data type
type UserUpdateData = Partial<Omit<User, 'id' | 'createdAt'>>;

// Admin validation function type
type AdminValidationFunction = (req: Request) => string | null;

// Database error handling is now handled by the sendDatabaseError utility

// Enhanced error response handler with consistent response shape using new utilities
function handleApiError(error: unknown, operation: string, res: Response): void {
  // Handle Zod validation errors
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    const errorMessage = fromZodError(error as Error).toString();
    console.error(`[VALIDATION ERROR] ${operation}:`, errorMessage);
    sendValidationError(res, "Validation failed", [errorMessage]);
    return;
  }
  
  // Handle database errors using the new utility
  if (error && typeof error === "object" && ("code" in error || "constraint" in error)) {
    sendDatabaseError(res, operation, error as DatabaseError);
    return;
  }
  
  // Handle custom errors with status codes
  if (error && typeof error === "object" && "status" in error) {
    const appError = error as AppError;
    const message = appError.message || `Failed to ${operation}`;
    const statusCode = appError.status || 500;
    const code = appError.code || undefined;
    const errors = appError.errors || undefined;
    
    sendError(res, message, statusCode, errors, code);
    return;
  }
  
  // Generic server error
  console.error(`Unexpected error during ${operation}:`, error);
  sendError(res, `Failed to ${operation}. Please try again later.`);
}

// Standardized async route wrapper for consistent error handling
function asyncRoute(operation: string, handler: AsyncRouteHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleApiError(error, operation, res);
    }
  };
}

// Helper wrapper to ensure storage is available for each route
function withStorage<T extends unknown[], R>(
  handler: (storage: Awaited<ReturnType<typeof getStorage>>, ...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    try {
      const storage = await getStorage();
      return await handler(storage, ...args);
    } catch (error) {
      console.error('Storage connection error:', error);
      // Don't throw - let the asyncRoute wrapper handle the error properly
      return Promise.reject({
        status: 500,
        message: 'Database connection failed. Please try again later.'
      });
    }
  };
}

// Enhanced retry mechanism with exponential backoff and jitter
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<{ success: boolean; data?: T; error?: Error; attempts: number }> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const data = await operation();
      const duration = Date.now() - startTime;
      
      console.log(`[RETRY_SUCCESS] ${operationName} succeeded on attempt ${attempt}/${maxRetries} (${duration}ms)`);
      return { success: true, data, attempts: attempt };
    } catch (error) {
      const err = error as DatabaseError;
      lastError = err;
      const isLastAttempt = attempt === maxRetries;
      
      // Categorize errors to determine if retry is appropriate
      const isRetryableError = !err.code || !['23505', '23503', '23502'].includes(err.code);
      
      if (isLastAttempt || !isRetryableError) {
        console.error(`[RETRY_FAILED] ${operationName} failed on attempt ${attempt}/${maxRetries}:`, {
          error: err.message,
          code: err.code,
          retryable: isRetryableError,
          isLastAttempt
        });
        
        if (!isRetryableError) {
          console.log(`[RETRY_SKIP] ${operationName} - non-retryable error, skipping remaining attempts`);
        }
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
      const delay = Math.min(exponentialDelay + jitter, 10000); // Cap at 10 seconds
      
      console.warn(`[RETRY_ATTEMPT] ${operationName} failed on attempt ${attempt}/${maxRetries}, retrying in ${Math.round(delay)}ms:`, {
        error: err.message,
        code: err.code
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { success: false, error: lastError, attempts: maxRetries };
}

// Structured error logging for admin visibility
interface AdminStatsError {
  operation: string;
  timestamp: string;
  error: string;
  code?: string;
  attempts: number;
  duration?: number;
  context?: Record<string, unknown>;
}

function logAdminStatsError(error: AdminStatsError): void {
  console.error('[ADMIN_STATS_ERROR]', JSON.stringify({
    ...error,
    severity: error.attempts > 1 ? 'HIGH' : 'MEDIUM',
    category: error.code ? 'DATABASE' : 'SYSTEM'
  }));
}

// Cache configuration for admin stats
const CACHE_CONFIG = {
  // Cache for 2 minutes for high-traffic stats
  short: { maxAge: 2 * 60 * 1000, preFetch: 0.6 },
  // Cache for 5 minutes for moderate-traffic stats  
  medium: { maxAge: 5 * 60 * 1000, preFetch: 0.6 },
  // Cache for 10 minutes for low-traffic stats
  long: { maxAge: 10 * 60 * 1000, preFetch: 0.6 }
};

// Memoized data fetchers with retry logic
const getCachedUserCount = memoizee(async () => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getUserCount();
  }, 'getUserCount');
  
  if (!result.success) {
    logAdminStatsError({
      operation: 'getUserCount',
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, CACHE_CONFIG.medium);

const getCachedAppointments = memoizee(async () => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getAllAppointments();
  }, 'getAllAppointments');
  
  if (!result.success) {
    logAdminStatsError({
      operation: 'getAllAppointments',
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, CACHE_CONFIG.short);

const getCachedServices = memoizee(async () => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getAllServices();
  }, 'getAllServices');
  
  if (!result.success) {
    logAdminStatsError({
      operation: 'getAllServices',
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true });

const getCachedLocations = memoizee(async () => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getAllLocations();
  }, 'getAllLocations');
  
  if (!result.success) {
    logAdminStatsError({
      operation: 'getAllLocations',
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true });

const getCachedCars = memoizee(async () => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getAllCars();
  }, 'getAllCars');
  
  if (!result.success) {
    logAdminStatsError({
      operation: 'getAllCars',
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.medium, promise: true });

// Enhanced caching system for individual lookups and category-based queries

// Parameterized caching for individual service lookups
const getCachedService = memoizee(async (id: string) => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getService(id);
  }, `getService(${id})`);
  
  if (!result.success) {
    logAdminStatsError({
      operation: `getService(${id})`,
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts,
      context: { serviceId: id }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

// Parameterized caching for individual location lookups
const getCachedLocation = memoizee(async (id: string) => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getLocation(id);
  }, `getLocation(${id})`);
  
  if (!result.success) {
    logAdminStatsError({
      operation: `getLocation(${id})`,
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts,
      context: { locationId: id }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

// Parameterized caching for individual car lookups
const getCachedCar = memoizee(async (id: string) => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getCar(id);
  }, `getCar(${id})`);
  
  if (!result.success) {
    logAdminStatsError({
      operation: `getCar(${id})`,
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts,
      context: { carId: id }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

// Parameterized caching for category-based service queries
const getCachedServicesByCategory = memoizee(async (category: string) => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getServicesByCategory(category);
  }, `getServicesByCategory(${category})`);
  
  if (!result.success) {
    logAdminStatsError({
      operation: `getServicesByCategory(${category})`,
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: result.error?.code,
      attempts: result.attempts,
      context: { category }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

// Centralized cache management system
class CacheManager {
  private static instance: CacheManager;
  private cacheCounters: {
    services: { bulk: number; individual: number; categories: number; };
    locations: { bulk: number; individual: number; };
    cars: { bulk: number; individual: number; };
    appointments: number;
    users: number;
    hits: number;
    misses: number;
  };
  
  private constructor() {
    // Initialize all counters to 0
    this.cacheCounters = {
      services: { bulk: 0, individual: 0, categories: 0 },
      locations: { bulk: 0, individual: 0 },
      cars: { bulk: 0, individual: 0 },
      appointments: 0,
      users: 0,
      hits: 0,
      misses: 0
    };
  }
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  // Methods to track cache operations
  trackCacheHit(): void {
    this.cacheCounters.hits++;
  }
  
  trackCacheMiss(): void {
    this.cacheCounters.misses++;
  }
  
  // Methods to increment counters when items are cached
  incrementServicesBulkCounter(): void {
    this.cacheCounters.services.bulk++;
  }
  
  incrementServicesIndividualCounter(): void {
    this.cacheCounters.services.individual++;
  }
  
  incrementServicesCategoriesCounter(): void {
    this.cacheCounters.services.categories++;
  }
  
  incrementLocationsBulkCounter(): void {
    this.cacheCounters.locations.bulk++;
  }
  
  incrementLocationsIndividualCounter(): void {
    this.cacheCounters.locations.individual++;
  }
  
  incrementCarsBulkCounter(): void {
    this.cacheCounters.cars.bulk++;
  }
  
  incrementCarsIndividualCounter(): void {
    this.cacheCounters.cars.individual++;
  }
  
  incrementAppointmentsCounter(): void {
    this.cacheCounters.appointments++;
  }
  
  incrementUsersCounter(): void {
    this.cacheCounters.users++;
  }
  
  // Enhanced invalidation for service-related caches with category transition support
  invalidateServiceCaches(serviceId?: string, prevCategory?: string, nextCategory?: string): void {
    const categories = [prevCategory, nextCategory].filter(Boolean);
    console.log('[CACHE_INVALIDATION] Invalidating service caches', { 
      serviceId, 
      prevCategory, 
      nextCategory, 
      categoriesAffected: categories.length 
    });
    
    try {
      // Clear bulk services cache and reset counter
      getCachedServices.clear();
      this.cacheCounters.services.bulk = 0;
      
      // Clear individual service cache if ID provided
      if (serviceId) {
        getCachedService.delete(serviceId);
        this.cacheCounters.services.individual = Math.max(0, this.cacheCounters.services.individual - 1);
        console.log(`[CACHE_INVALIDATION] Cleared individual service cache for ID: ${serviceId}`);
      }
      
      // Handle category-based invalidation
      if (categories.length > 0) {
        // Clear specific categories when we know them (handles both old and new categories)
        categories.forEach(category => {
          if (category) {
            getCachedServicesByCategory.delete(category);
            this.cacheCounters.services.categories = Math.max(0, this.cacheCounters.services.categories - 1);
            console.log(`[CACHE_INVALIDATION] Cleared services by category cache for: ${category}`);
          }
        });
        
        console.log(`[CACHE_INVALIDATION] Cleared category caches for ${categories.length} categories: ${categories.join(', ')}`);
      } else {
        // Clear all category caches when we don't know the specific categories
        getCachedServicesByCategory.clear();
        this.cacheCounters.services.categories = 0;
        console.log('[CACHE_INVALIDATION] Cleared all category caches (categories unknown)');
      }
      
      console.log('[CACHE_INVALIDATION] Service caches invalidated successfully');
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing service caches:', error);
    }
  }
  
  // Invalidate all location-related caches
  invalidateLocationCaches(locationId?: string): void {
    console.log('[CACHE_INVALIDATION] Invalidating location caches', { locationId });
    
    try {
      // Clear bulk locations cache and reset counter
      getCachedLocations.clear();
      this.cacheCounters.locations.bulk = 0;
      
      // Clear individual location cache if ID provided
      if (locationId) {
        getCachedLocation.delete(locationId);
        this.cacheCounters.locations.individual = Math.max(0, this.cacheCounters.locations.individual - 1);
        console.log(`[CACHE_INVALIDATION] Cleared individual location cache for ID: ${locationId}`);
      }
      
      console.log('[CACHE_INVALIDATION] Location caches invalidated successfully');
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing location caches:', error);
    }
  }
  
  // Invalidate all car-related caches
  invalidateCarCaches(carId?: string): void {
    console.log('[CACHE_INVALIDATION] Invalidating car caches', { carId });
    
    try {
      // Clear bulk cars cache and reset counter
      getCachedCars.clear();
      this.cacheCounters.cars.bulk = 0;
      
      // Clear individual car cache if ID provided
      if (carId) {
        getCachedCar.delete(carId);
        this.cacheCounters.cars.individual = Math.max(0, this.cacheCounters.cars.individual - 1);
        console.log(`[CACHE_INVALIDATION] Cleared individual car cache for ID: ${carId}`);
      }
      
      console.log('[CACHE_INVALIDATION] Car caches invalidated successfully');
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing car caches:', error);
    }
  }
  
  // Invalidate appointment-related caches
  invalidateAppointmentCaches(): void {
    console.log('[CACHE_INVALIDATION] Invalidating appointment caches');
    
    try {
      getCachedAppointments.clear();
      this.cacheCounters.appointments = 0;
      console.log('[CACHE_INVALIDATION] Appointment caches invalidated successfully');
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing appointment caches:', error);
    }
  }
  
  // Invalidate user-related caches
  invalidateUserCaches(): void {
    console.log('[CACHE_INVALIDATION] Invalidating user caches');
    
    try {
      getCachedUserCount.clear();
      this.cacheCounters.users = 0;
      console.log('[CACHE_INVALIDATION] User caches invalidated successfully');
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing user caches:', error);
    }
  }
  
  // Clear all caches (nuclear option)
  clearAllCaches(): void {
    console.log('[CACHE_INVALIDATION] Clearing ALL caches');
    
    try {
      getCachedServices.clear();
      getCachedService.clear();
      getCachedServicesByCategory.clear();
      getCachedLocations.clear();
      getCachedLocation.clear();
      getCachedCars.clear();
      getCachedCar.clear();
      getCachedAppointments.clear();
      getCachedUserCount.clear();
      
      // Reset all counters
      this.cacheCounters = {
        services: { bulk: 0, individual: 0, categories: 0 },
        locations: { bulk: 0, individual: 0 },
        cars: { bulk: 0, individual: 0 },
        appointments: 0,
        users: 0,
        hits: 0,
        misses: 0
      };
      
      console.log('[CACHE_INVALIDATION] All caches cleared successfully');
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing all caches:', error);
    }
  }
  
  // Get cache statistics using explicit counters
  getCacheStats(): CacheStats {
    const totalEntries = 
      this.cacheCounters.services.bulk + 
      this.cacheCounters.services.individual + 
      this.cacheCounters.services.categories + 
      this.cacheCounters.locations.bulk + 
      this.cacheCounters.locations.individual + 
      this.cacheCounters.cars.bulk + 
      this.cacheCounters.cars.individual + 
      this.cacheCounters.appointments + 
      this.cacheCounters.users;
    
    const totalOperations = this.cacheCounters.hits + this.cacheCounters.misses;
    const hitRate = totalOperations > 0 ? (this.cacheCounters.hits / totalOperations * 100).toFixed(2) + '%' : '0%';
    
    return {
      // Cache entry counts by type
      services: {
        bulk: this.cacheCounters.services.bulk,
        individual: this.cacheCounters.services.individual,
        categories: this.cacheCounters.services.categories
      },
      locations: {
        bulk: this.cacheCounters.locations.bulk,
        individual: this.cacheCounters.locations.individual
      },
      cars: {
        bulk: this.cacheCounters.cars.bulk,
        individual: this.cacheCounters.cars.individual
      },
      appointments: this.cacheCounters.appointments,
      users: this.cacheCounters.users,
      
      // Performance metrics
      performance: {
        totalEntries,
        hits: this.cacheCounters.hits,
        misses: this.cacheCounters.misses,
        hitRate,
        totalOperations
      },
      
      // Metadata
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance for use in routes
const cacheManager = CacheManager.getInstance();

// Standardized admin stats response structure
interface AdminStatsResponse {
  // Core metrics - always present with availability indicators
  totalUsers: number | null;
  totalUsersAvailable: boolean;
  
  totalAppointments: number | null;
  appointmentsAvailable: boolean;
  pendingAppointments: number | null;
  confirmedAppointments: number | null;
  completedAppointments: number | null;
  cancelledAppointments: number | null;
  recentAppointments: number | null;
  
  totalServices: number | null;
  servicesAvailable: boolean;
  popularServices: number | null;
  
  totalLocations: number | null;
  locationsAvailable: boolean;
  
  totalCars: number | null;
  carsAvailable: boolean;
  activeCars: number | null;
  auctionCars: number | null;
  activeAuctions: number | null;
  
  // Metadata
  lastUpdated: string;
  cacheStatus: {
    appointments: 'cached' | 'fresh' | 'fallback';
    users: 'cached' | 'fresh' | 'fallback';
    services: 'cached' | 'fresh' | 'fallback';
    locations: 'cached' | 'fresh' | 'fallback';
    cars: 'cached' | 'fresh' | 'fallback';
  };
  reliability: {
    totalSources: number;
    availableSources: number;
    failedSources: string[];
    successRate: number;
  };
  
  // Only include warnings if there are actual issues that affect functionality
  warnings?: {
    message: string;
    details: string[];
    impact: 'low' | 'medium' | 'high';
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  // Note: SESSION_SECRET is validated at startup - no fallback needed
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());
  
  // CSRF Protection Middleware for state-changing requests
  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Only protect state-changing methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }
    
    // Skip CSRF only for Google OAuth routes (they use state parameter protection)
    // Note: paths are relative to /api mount point
    const skipRoutes = [
      '/auth/google',
      '/auth/google/callback'
    ];
    
    if (skipRoutes.some(route => req.path.startsWith(route))) {
      // Additional security validation for OAuth routes
      const userAgent = req.headers['user-agent'];
      const origin = req.headers.origin;
      const referer = req.headers.referer;
      
      // Log OAuth route access for monitoring
      console.log(`[CSRF] OAuth route accessed: ${req.path}`, {
        userAgent: userAgent?.substring(0, 100), // Truncate for logging
        origin,
        referer,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      
      // Basic validation for suspicious requests
      if (!userAgent || userAgent.length < 10) {
        console.warn(`[CSRF] Suspicious OAuth request - invalid/missing user agent for ${req.path}`);
      }
      
      // For OAuth callback, validate that it comes from Google
      if (req.path === '/auth/google/callback') {
        // The referer should typically be from Google for legitimate OAuth flows
        // But this is not enforced as it can be legitimately missing in some cases
        if (referer && !referer.includes('google') && !referer.includes('accounts.google.com')) {
          console.warn(`[CSRF] OAuth callback from unexpected referer: ${referer}`);
        }
      }
      
      console.log(`[CSRF] Skipping CSRF protection for OAuth route: ${req.path}`);
      return next();
    }
    
    // Additional Origin/Referer validation for critical auth routes  
    // Note: req.path is relative to mount point, so use '/auth/login' not '/api/auth/login'
    if (['/auth/login', '/auth/register'].includes(req.path)) {
      const origin = req.headers.origin;
      const referer = req.headers.referer;
      // More robust protocol detection for development environments
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host');
      const expectedOrigin = `${protocol}://${host}`;
      
      console.log(`[CSRF] Auth route: ${req.path}`);
      console.log(`[CSRF] Origin: ${origin}, Referer: ${referer}`);
      console.log(`[CSRF] Expected origin: ${expectedOrigin}`);
      
      if (!origin && !referer) {
        console.log(`[CSRF] REJECTED: Missing origin/referer for ${req.path}`);
        return sendForbiddenError(res, "CSRF protection: Missing origin/referer header");
      }
      
      if (origin && origin !== expectedOrigin) {
        console.log(`[CSRF] REJECTED: Invalid origin ${origin} (expected ${expectedOrigin}) for ${req.path}`);
        return sendForbiddenError(res, "CSRF protection: Invalid origin");
      }
      
      if (referer && !referer.startsWith(expectedOrigin)) {
        console.log(`[CSRF] REJECTED: Invalid referer ${referer} (expected to start with ${expectedOrigin}) for ${req.path}`);
        return sendForbiddenError(res, "CSRF protection: Invalid referer");
      }
      
      console.log(`[CSRF] PASSED: Auth route ${req.path} passed origin/referer validation`);
      return next();
    }
    
    // Require custom header for API calls (SPA CSRF protection)
    // Check for the header with case-insensitive lookup
    const customHeader = req.headers['x-csrf-protection'];
    if (!customHeader || customHeader !== 'ronak-garage') {
      console.log(`[CSRF] REJECTED: Missing/invalid security header for ${req.path}. Got: "${customHeader}"`);
      console.log(`[CSRF] Available headers:`, Object.keys(req.headers).filter(h => h.toLowerCase().includes('csrf')));
      return sendForbiddenError(res, "CSRF protection: Missing or invalid security header");
    }
    
    console.log(`[CSRF] PASSED: API route ${req.path} passed security header validation`);
    next();
  };
  
  // Apply CSRF protection to all API routes
  app.use('/api', csrfProtection);

  // Authentication Routes - DISABLED (OTP-only authentication)
  // Email/password authentication has been disabled in favor of OTP-only authentication
  app.post("/api/auth/register", async (req, res) => {
    return sendError(res, "Email/password registration is disabled. Please use OTP authentication.", 403, undefined, "AUTH_METHOD_DISABLED");
  });

  app.post("/api/auth/login", async (req, res) => {
    return sendError(res, "Email/password login is disabled. Please use OTP authentication.", 403, undefined, "AUTH_METHOD_DISABLED");
  });

  app.post("/api/auth/logout", asyncRoute("logout", async (req: Request, res: Response) => {
    req.logout((err: Error | null) => {
      if (err) {
        throw { status: 500, message: "Logout failed" };
      }
      return sendSuccess(res, null, "Logout successful");
    });
  }));

  // Google OAuth routes - DISABLED (OTP-only authentication)
  app.get("/api/auth/google", asyncRoute("initiate Google OAuth", async (req: Request, res: Response, next: NextFunction) => {
    return res.redirect("/login?error=oauth_disabled");
  }));

  app.get("/api/auth/google/callback", asyncRoute("Google OAuth callback", async (req: Request, res: Response) => {
    return res.redirect("/login?error=oauth_disabled");
  }));

  // Get current user
  app.get("/api/auth/me", asyncRoute("get current user", async (req: Request, res: Response) => {
    if (req.user) {
      const { password, ...userResponse } = req.user as any;
      return sendSuccess(res, userResponse);
    } else {
      throw { status: 401, message: "Not authenticated" };
    }
  }));

  // Get available auth providers - OTP only
  app.get("/api/auth/providers", asyncRoute("get auth providers", async (req: Request, res: Response) => {
    // Only OTP authentication is available (WhatsApp and Email)
    const providers = ["mobile"];
    
    return sendSuccess(res, { providers });
  }));

  // Mobile Registration Routes
  app.post("/api/auth/mobile/send-otp", asyncRoute("send mobile OTP", async (req: Request, res: Response) => {
    // Validate request data using sendOtpSchema
    const validationResult = sendOtpSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
    }

    const { phone, countryCode, purpose, channel } = validationResult.data;
    const email = req.body.email; // Optional email for email channel
    
    // Validate email is provided for email channel
    if (channel === 'email' && !email) {
      return sendValidationError(res, "Email address is required for email OTP channel", []);
    }
    
    const result = await OTPService.sendOTP(phone, countryCode, purpose, channel, email);
    
    if (result.success) {
      const channelMessage = channel === 'whatsapp' 
        ? `OTP sent via WhatsApp to ${countryCode}${phone}`
        : `OTP sent via email to ${email}`;
      
      return sendSuccess(res, {
        expiresIn: result.expiresIn,
        channel: channel
      }, channelMessage);
    } else {
      return sendError(res, result.message, 400, undefined, "OTP_SEND_FAILED", {
        attempts: result.attempts,
        maxAttempts: result.maxAttempts,
        channel: channel
      });
    }
  }));

  app.post("/api/auth/mobile/verify-otp", asyncRoute("verify mobile OTP", async (req: Request, res: Response) => {
    // Validate request data using the updated schema with purpose
    const validationResult = verifyOtpSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
    }

    const { phone, countryCode, otpCode, purpose, channel } = validationResult.data;
    const storage = await getStorage();

    // Verify OTP with the correct purpose
    const result = await OTPService.verifyOTP(phone, countryCode, otpCode, purpose);
    
    if (!result.success) {
      return sendError(res, result.message, 400, undefined, "OTP_VERIFICATION_FAILED", {
        attempts: result.attempts,
        maxAttempts: result.maxAttempts,
        expired: result.expired
      });
    }

    // OTP verified successfully - handle different purposes
    if (purpose === "login") {
      // For login: find existing user and establish session
      const user = await storage.getUserByPhone(phone, countryCode);
      
      if (!user) {
        return sendNotFoundError(res, "Account");
      }

      // Session fixation mitigation: regenerate session before mobile login
      req.session.regenerate((sessionErr: Error | null) => {
        if (sessionErr) {
          console.error("Session regeneration failed for mobile login:", sessionErr);
          return sendError(res, "OTP verified but session setup failed. Please try again.", 500, undefined, "SESSION_SETUP_FAILED");
        }
        
        // Log the user in via passport after session regeneration
        req.login(user, (loginErr: Error | null) => {
          if (loginErr) {
            console.error("Login after mobile OTP verification failed:", loginErr);
            
            // More specific login session errors
            if (loginErr.message?.includes('session')) {
              return sendError(res, "Session creation failed. Please try again.", 500, undefined, "SESSION_CREATION_FAILED");
            }
            
            if (loginErr.message?.includes('serialize')) {
              return sendError(res, "Login processing error. Please clear your cookies and try again.", 500, undefined, "LOGIN_SERIALIZE_ERROR");
            }
            
            return sendError(res, "Login failed. Please try again later.", 500, undefined, "LOGIN_FAILED");
          }
          
          // Initialize session timestamp for admin middleware
          req.session.createdAt = Date.now();
          
          const { password, ...userResponse } = user;
          return sendSuccess(res, { user: userResponse }, "Login successful");
        });
      });
    } else {
      // For registration and password_reset: just verify OTP
      return sendSuccess(res, { verified: true }, "OTP verified successfully. Please complete registration.");
    }
  }));

  // Complete mobile registration with profile data
  app.post("/api/auth/mobile/register", asyncRoute("complete mobile registration", async (req: Request, res: Response) => {
    // Validate request data using schema
    const validationResult = mobileRegisterSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
    }

    const {
      phone,
      countryCode,
      name,
      email,
      dateOfBirth,
      registrationNumbers,
      profileImage,
      address,
      city,
      state,
      zipCode
    } = validationResult.data;

    const storage = await getStorage();
    
    // Check if user already exists with this phone number
    let user = await storage.getUserByPhone(phone, countryCode);
    
    if (user) {
      // User exists, just log them in and update profile if needed
      if (email || dateOfBirth || registrationNumbers || profileImage || address || city || state || zipCode) {
        // Update profile with new data
        const updateData: UserUpdateData = {};
        if (email) updateData.email = email;
        if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
        if (registrationNumbers) updateData.registrationNumbers = registrationNumbers;
        if (profileImage) updateData.profileImage = profileImage;
        if (address) updateData.address = address;
        if (city) updateData.city = city;
        if (state) updateData.state = state;
        if (zipCode) updateData.zipCode = zipCode;
        
        user = await storage.updateUser(user.id, updateData);
      }
      
      // Session fixation mitigation: regenerate session before mobile login (existing user)
      req.session.regenerate((sessionErr: Error | null) => {
        if (sessionErr) {
          console.error("Session regeneration failed for mobile user:", sessionErr);
          return sendError(res, "Profile updated but session setup failed. Please log in manually.", 500, undefined, "SESSION_SETUP_FAILED");
        }
        
        req.login(user!, async (err: Error | null) => {
          if (err) {
            console.error("Login after mobile registration failed:", err);
            return sendError(res, "Registration completed but login failed. Please try logging in.", 500, undefined, "LOGIN_FAILED");
          }
        
        // Initialize session timestamp for admin middleware
        req.session.createdAt = Date.now();
        
        // Send welcome WhatsApp message for new registrations
        try {
          if (user!.phone && user!.countryCode) {
            const welcomeResult = await WhatsAppService.sendWelcomeMessage(
              user!.phone,
              user!.countryCode,
              user!.name
            );
            
            if (welcomeResult.success) {
              console.log(`[REGISTRATION] Welcome WhatsApp sent to ${user!.countryCode}${user!.phone}`);
            } else {
              console.error(`[REGISTRATION] Welcome WhatsApp failed: ${welcomeResult.error}`);
            }
          }
        } catch (welcomeError) {
          const err = welcomeError as Error;
          console.error(`[REGISTRATION] Welcome message error: ${err.message}`);
        }
        
          const { password, ...userResponse } = user!;
          return sendSuccess(res, { user: userResponse }, "Profile updated and logged in successfully");
        });
      });
    } else {
      // Create new user with complete profile
      const userData: UserUpdateData = {
        phone,
        countryCode,
        phoneVerified: true,
        name,
        provider: "mobile",
        role: "customer"
      };
      
      if (email) userData.email = email;
      if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
      if (registrationNumbers) userData.registrationNumbers = registrationNumbers;
      if (profileImage) userData.profileImage = profileImage;
      if (address) userData.address = address;
      if (city) userData.city = city;
      if (state) userData.state = state;
      if (zipCode) userData.zipCode = zipCode;

      const newUser = await storage.createUser(userData);

      // Session fixation mitigation: regenerate session before mobile login (new user)
      req.session.regenerate((sessionErr: Error | null) => {
        if (sessionErr) {
          console.error("Session regeneration failed for new mobile user:", sessionErr);
          return sendError(res, "Account created but session setup failed. Please log in manually.", 500, undefined, "SESSION_SETUP_FAILED");
        }
        
        req.login(newUser, async (err: Error | null) => {
          if (err) {
            console.error("Login after mobile registration failed:", err);
            return sendError(res, "Account created but login failed. Please try logging in.", 500, undefined, "LOGIN_FAILED");
          }
        
        // Initialize session timestamp for admin middleware
        req.session.createdAt = Date.now();
        
        // Send welcome WhatsApp message for new registrations
        try {
          if (newUser.phone && newUser.countryCode) {
            const welcomeResult = await WhatsAppService.sendWelcomeMessage(
              newUser.phone,
              newUser.countryCode,
              newUser.name
            );
            
            if (welcomeResult.success) {
              console.log(`[REGISTRATION] Welcome WhatsApp sent to ${newUser.countryCode}${newUser.phone}`);
            } else {
              console.error(`[REGISTRATION] Welcome WhatsApp failed: ${welcomeResult.error}`);
            }
          }
        } catch (welcomeError) {
          const err = welcomeError as Error;
          console.error(`[REGISTRATION] Welcome message error: ${err.message}`);
        }
        
          const { password, ...userResponse } = newUser;
          return sendResourceCreated(res, { user: userResponse }, "Account created and logged in successfully");
        });
      });
    }
  }));

  // Authentication middleware for protected routes
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Performance Metrics Endpoint (protected - requires authentication)
  app.get("/api/metrics", requireAuth, asyncRoute("get performance metrics", async (req, res) => {
    const metrics = getPerformanceMetrics();
    sendSuccess(res, {
      ...metrics,
      monitoringUptimeMs: Date.now() - metrics.monitoringSince,
      timestamp: new Date().toISOString()
    });
  }));

  // Get user profile
  app.get("/api/profile", requireAuth, asyncRoute("get user profile", async (req: Request, res: Response) => {
    const { password, ...userProfile } = req.user;
    res.json({ user: userProfile });
  }));

  // Update user profile
  app.patch("/api/profile", requireAuth, asyncRoute("update user profile", async (req: Request, res: Response) => {
    const validationResult = updateProfileSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
    }

    const updateData: UserUpdateData = { ...validationResult.data };
    const storage = await getStorage();
    
    // Convert dateOfBirth to Date if provided
    if (updateData.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    const updatedUser = await storage.updateUser(req.user.id, updateData);
    const { password, ...userResponse } = updatedUser!;
    
    return sendResourceUpdated(res, { user: userResponse }, "Profile updated successfully");
  }));

  // WhatsApp Messaging Routes
  app.post("/api/whatsapp/send-confirmation", requireAuth, asyncRoute("send WhatsApp confirmation", async (req: Request, res: Response) => {
    // Validate request data using Zod schema
    const validationResult = whatsappConfirmationSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      throw {
        name: "ZodError",
        errors: validationResult.error.errors
      };
    }

    const { phone, countryCode, appointmentData, appointmentId } = validationResult.data;

    // Additional phone number format validation
    const validation = WhatsAppService.validateWhatsAppNumber(phone, countryCode);
    if (!validation.valid) {
      throw { status: 400, message: validation.message };
    }

    // Transform appointmentData to match AppointmentConfirmationData interface
    const transformedAppointmentData = {
      customerName: appointmentData.customerName,
      serviceName: appointmentData.serviceName,
      dateTime: appointmentData.dateTime,
      location: appointmentData.locationName, // locationName -> location
      carDetails: 'Vehicle details not provided', // carDetails not in schema, use default
      bookingId: appointmentId || 'TEMP-' + Date.now().toString(), // Use appointmentId or generate temp ID
      mechanicName: appointmentData.mechanicName,
      price: appointmentData.price
    };

    const result = await WhatsAppService.sendAppointmentConfirmation(
      phone, 
      countryCode, 
      transformedAppointmentData,
      appointmentId
    );
    
    if (result.success) {
      return sendSuccess(res, { messageSid: result.messageSid }, "WhatsApp confirmation sent successfully");
    } else {
      throw { status: 500, message: result.message, error: result.error };
    }
  }));

  app.post("/api/whatsapp/send-status-update", requireAuth, asyncRoute("send WhatsApp status update", async (req: Request, res: Response) => {
    const { phone, countryCode, statusData, appointmentId } = req.body;
    
    if (!phone || !countryCode || !statusData) {
      return sendValidationError(res, "Phone number, country code, and status data are required");
    }

    const result = await WhatsAppService.sendStatusUpdate(
      phone, 
      countryCode, 
      statusData,
      appointmentId
    );
    
    if (result.success) {
      return sendSuccess(res, { messageSid: result.messageSid }, "WhatsApp status update sent successfully");
    } else {
      return sendError(res, result.message, 500, undefined, "WHATSAPP_SEND_FAILED");
    }
  }));

  app.post("/api/whatsapp/send-bid-notification", requireAuth, asyncRoute("send WhatsApp bid notification", async (req: Request, res: Response) => {
    const { phone, countryCode, bidData } = req.body;
    
    if (!phone || !countryCode || !bidData) {
      return sendValidationError(res, "Phone number, country code, and bid data are required");
    }

    const result = await WhatsAppService.sendBidNotification(
      phone, 
      countryCode, 
      bidData
    );
    
    if (result.success) {
      return sendSuccess(res, { messageSid: result.messageSid }, "WhatsApp bid notification sent successfully");
    } else {
      return sendError(res, result.message, 500, undefined, "WHATSAPP_SEND_FAILED");
    }
  }));

  app.get("/api/whatsapp/history/:phone", requireAuth, asyncRoute("get WhatsApp message history", async (req: Request, res: Response) => {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    
    if (!phone) {
      return sendValidationError(res, "Phone number is required");
    }

    const history = await WhatsAppService.getMessageHistory(phone, limit);
    return sendSuccess(res, { messages: history, count: history.length });
  }));

  // Enhanced admin authorization middleware with security features
  const ADMIN_RATE_LIMIT = 100; // requests per minute
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
  
  // Prevent duplicate cleanup intervals during hot reloads
  let cleanupIntervalId: NodeJS.Timeout | null = null;
  
  function startRateLimitCleanup() {
    // Clear any existing interval to prevent duplicates
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      console.log('[RATE_LIMIT_CLEANUP] Cleared existing cleanup interval');
    }
    
    // Setup new cleanup interval (runs every 10 minutes)
    cleanupIntervalId = setInterval(async () => {
      try {
        const storage = await getStorage();
        const cleanedCount = await storage.cleanupExpiredRateLimits();
        if (cleanedCount > 0) {
          console.log(`[RATE_LIMIT_CLEANUP] Cleaned up ${cleanedCount} expired rate limit entries`);
        }
      } catch (error) {
        console.error('[RATE_LIMIT_CLEANUP] Failed to cleanup expired rate limits:', error);
      }
    }, 10 * 60 * 1000);
    
    console.log('[RATE_LIMIT_CLEANUP] Started cleanup interval (runs every 10 minutes)');
  }
  
  // Start the cleanup process
  startRateLimitCleanup();

  const createEnhancedAdminMiddleware = (options: {
    action: string;
    resource: string;
    validateInput?: AdminValidationFunction;
    rateLimit?: number;
  }) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const { action, resource, validateInput, rateLimit = ADMIN_RATE_LIMIT } = options;
      
      // 1. Authentication check
      if (!req.user) {
        return res.status(401).json({ 
          message: "Authentication required",
          code: "AUTH_REQUIRED" 
        });
      }
      
      // 2. Authorization check
      if (req.user.role !== "admin") {
        return res.status(403).json({ 
          message: "Admin access required",
          code: "INSUFFICIENT_PRIVILEGES" 
        });
      }

      // 3. Atomic persistent rate limiting per admin user
      const userId = req.user.id;
      
      try {
        const storage = await getStorage();
        // Use atomic rate limit check and increment
        const rateResult = await storage.checkAndIncrementRateLimit(userId, RATE_LIMIT_WINDOW);
        
        // Check if the rate limit is exceeded within the current window
        if (rateResult.withinWindow && rateResult.count > rateLimit) {
          const now = Date.now();
          return res.status(429).json({ 
            message: "Rate limit exceeded. Please try again later.",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter: Math.ceil((rateResult.resetTime - now) / 1000)
          });
        }
        
        // Request is within rate limit - continue processing
        // No additional operations needed as the atomic check already incremented the counter
        
      } catch (error) {
        console.error('[RATE_LIMIT] Storage error, allowing request:', error);
        // On storage error, allow the request to continue rather than blocking it
      }

      // 4. Input validation
      if (validateInput) {
        const validationError = validateInput(req);
        if (validationError) {
          return res.status(400).json({ 
            message: validationError,
            code: "VALIDATION_ERROR" 
          });
        }
      }

      // 5. Session security - check for session activity and detect potential hijacking
      if (req.session) {
        // Check if session has proper timestamp (set during login)
        if (!req.session.createdAt) {
          return res.status(401).json({ 
            message: "Invalid session. Please login again.",
            code: "INVALID_SESSION" 
          });
        }
        
        const now = Date.now();
        const sessionAge = now - req.session.createdAt;
        const MAX_SESSION_AGE = 8 * 60 * 60 * 1000; // 8 hours for admin sessions
        
        if (sessionAge > MAX_SESSION_AGE) {
          return res.status(401).json({ 
            message: "Admin session expired. Please login again.",
            code: "SESSION_EXPIRED" 
          });
        }
        
        // Check for suspicious activity patterns - IP change detection
        const currentIP = req.ip || req.connection.remoteAddress;
        if (req.session.lastIP && req.session.lastIP !== currentIP) {
          console.warn(`[SECURITY] Admin session IP change detected: ${req.session.lastIP} -> ${currentIP} for user ${userId}`);
          // For high security, could force re-authentication here
          // return res.status(401).json({ message: "Session security violation detected", code: "IP_CHANGE_DETECTED" });
        }
        
        // Update session tracking
        req.session.lastIP = currentIP;
        req.session.lastActivity = Date.now();
      }

      // 6. Store request context for audit logging
      req.adminContext = {
        action,
        resource,
        adminUserId: userId,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        userAgent: req.get('User-Agent') || null,
        timestamp: new Date()
      };

      next();
    };
  };

  // Legacy middleware for backward compatibility
  const requireAdmin = createEnhancedAdminMiddleware({
    action: "access",
    resource: "admin_area"
  });

  // Helper function to safely capture entity snapshot for audit logging
  // Excludes sensitive fields like passwords and OTP codes
  function captureEntitySnapshot(entity: any): Record<string, any> {
    if (!entity || typeof entity !== 'object') {
      return {};
    }
    
    const { password, otpCodeHash, ...safe } = entity;
    return safe;
  }

  // Helper function to log admin actions
  const logAdminAction = async (req: Request, res: Response, additionalData?: Record<string, unknown>) => {
    if (!req.adminContext) return;
    
    try {
      const storage = await getStorage();
      const { action, resource, adminUserId, ipAddress, userAgent } = req.adminContext;
      
      const auditLog = {
        adminUserId,
        action,
        resource,
        resourceId: req.params.id || additionalData?.resourceId || null,
        oldValue: additionalData?.oldValue ? JSON.stringify(additionalData.oldValue) : null,
        newValue: additionalData?.newValue ? JSON.stringify(additionalData.newValue) : null,
        ipAddress,
        userAgent,
        additionalInfo: additionalData?.additionalInfo || null
      };
      
      await storage.logAdminAction(auditLog);
    } catch (error) {
      console.error('[AUDIT] Failed to log admin action:', error);
    }
  };

  // Admin user management API
  app.get("/api/admin/users/count", requireAdmin, asyncRoute("get user count", async (req: Request, res: Response) => {
    const storage = await getStorage();
    const count = await storage.getUserCount();
    res.json({ count });
  }));

  app.get("/api/admin/users", requireAdmin, asyncRoute("get all users", async (req: Request, res: Response) => {
    const storage = await getStorage();
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const [users, totalCount] = await Promise.all([
      storage.getAllUsers(offset, limit),
      storage.getUserCount()
    ]);
    
    // Remove passwords from response for security
    const safeUsers = users.map(({ password, ...user }) => user);
    
    res.json({ 
      users: safeUsers,
      total: totalCount,
      offset,
      limit,
      hasMore: users.length === limit
    });
  }));

  app.patch("/api/admin/users/:id", 
    createEnhancedAdminMiddleware({
      action: "role_change",
      resource: "user",
      rateLimit: 20, // More restrictive rate limit for role changes
      validateInput: (req) => {
        const { id } = req.params;
        const { role } = req.body;
        
        if (!id || typeof id !== 'string') {
          return "Invalid user ID format";
        }
        if (!role || typeof role !== 'string') {
          return "Role is required and must be a string";
        }
        if (!["customer", "admin"].includes(role)) {
          return "Invalid role. Role must be either 'customer' or 'admin'";
        }
        return null;
      }
    }),
    asyncRoute("update user role", async (req: Request, res: Response) => {
      const { id } = req.params;
      const { role } = req.body;
      const storage = await getStorage();
      
      try {
        // Check if user exists
        const existingUser = await storage.getUser(id);
        if (!existingUser) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to update non-existent user ${id}`
          });
          return res.status(404).json({ 
            message: "User not found",
            code: "USER_NOT_FOUND"
          });
        }
        
        // Prevent self-demotion (admin removing their own admin role)
        const currentUser = req.user as any;
        if (currentUser.id === id && role === "customer") {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: "Prevented self-demotion attempt"
          });
          return res.status(400).json({ 
            message: "You cannot remove your own admin privileges",
            code: "SELF_DEMOTION_DENIED"
          });
        }
        
        // Store old value for audit
        const oldRole = existingUser.role;
        
        // Update user role
        const updatedUser = await storage.updateUser(id, { role });
        if (!updatedUser) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Failed to update user ${id} role to ${role}`
          });
          return res.status(500).json({ 
            message: "Failed to update user role",
            code: "UPDATE_FAILED"
          });
        }
        
        // Log successful role change
        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: { role: oldRole, email: existingUser.email, name: existingUser.name },
          newValue: { role: role, email: updatedUser.email, name: updatedUser.name },
          additionalInfo: `Role changed from ${oldRole} to ${role}`
        });
        
        // Return updated user without password
        const { password, ...safeUser } = updatedUser;
        res.json({ 
          message: `User role updated to ${role} successfully`,
          user: safeUser,
          code: "ROLE_UPDATED"
        });
      } catch (error) {
        console.error('[ADMIN] Role update error:', error);
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Error during role update: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        return res.status(500).json({ 
          message: "Internal server error during role update",
          code: "INTERNAL_ERROR"
        });
      }
    })
  );

  // Enhanced admin statistics endpoint with retry logic, caching, and improved reliability
  app.get("/api/admin/stats", requireAdmin, asyncRoute("get admin dashboard statistics", async (req: Request, res: Response) => {
    const startTime = Date.now();
    console.log(`[ADMIN_STATS] Starting dashboard statistics request`);
    
    try {
      // Fetch data from all sources concurrently with retry logic and caching
      const [
        appointmentsResult,
        usersResult,
        servicesResult,
        locationsResult,
        carsResult
      ] = await Promise.all([
        getCachedAppointments(),
        getCachedUserCount(),
        getCachedServices(),
        getCachedLocations(),
        getCachedCars()
      ]);

      // Track successful vs failed sources for reliability metrics
      const sourceResults = {
        appointments: appointmentsResult,
        users: usersResult,
        services: servicesResult,
        locations: locationsResult,
        cars: carsResult
      };

      const successfulSources = Object.values(sourceResults).filter(r => r.success).length;
      const totalSources = Object.keys(sourceResults).length;
      const failedSources = Object.entries(sourceResults)
        .filter(([_, result]) => !result.success)
        .map(([source, _]) => source);

      // Extract data with fallbacks - always provide consistent structure
      const appointments = appointmentsResult.success ? appointmentsResult.data! : [];
      const userCount = usersResult.success ? usersResult.data! : 0;
      const services = servicesResult.success ? servicesResult.data! : [];
      const locations = locationsResult.success ? locationsResult.data! : [];
      const cars = carsResult.success ? carsResult.data! : [];

      // Calculate comprehensive statistics with consistent structure
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      const stats: AdminStatsResponse = {
        // User metrics - always present with availability indicator
        totalUsers: usersResult.success ? userCount : null,
        totalUsersAvailable: usersResult.success,
        
        // Appointment metrics - consistent structure regardless of availability
        totalAppointments: appointmentsResult.success ? appointments.length : null,
        appointmentsAvailable: appointmentsResult.success,
        pendingAppointments: appointmentsResult.success ? 
          appointments.filter(a => a.status === "pending").length : null,
        confirmedAppointments: appointmentsResult.success ? 
          appointments.filter(a => a.status === "confirmed").length : null,
        completedAppointments: appointmentsResult.success ? 
          appointments.filter(a => a.status === "completed").length : null,
        cancelledAppointments: appointmentsResult.success ? 
          appointments.filter(a => a.status === "cancelled").length : null,
        recentAppointments: appointmentsResult.success ? 
          appointments.filter(a => new Date(a.createdAt) > thirtyDaysAgo).length : null,
        
        // Service metrics - consistent structure
        totalServices: servicesResult.success ? services.length : null,
        servicesAvailable: servicesResult.success,
        popularServices: servicesResult.success ? 
          services.filter(s => s.popular).length : null,
        
        // Location metrics - consistent structure
        totalLocations: locationsResult.success ? locations.length : null,
        locationsAvailable: locationsResult.success,
        
        // Car metrics - consistent structure
        totalCars: carsResult.success ? cars.length : null,
        carsAvailable: carsResult.success,
        activeCars: carsResult.success ? 
          cars.filter(c => !c.isAuction).length : null,
        auctionCars: carsResult.success ? 
          cars.filter(c => c.isAuction).length : null,
        activeAuctions: carsResult.success ? 
          cars.filter(c => c.isAuction && c.auctionEndTime && new Date(c.auctionEndTime) > now).length : null,
        
        // Metadata for monitoring and debugging
        lastUpdated: new Date().toISOString(),
        cacheStatus: {
          appointments: appointmentsResult.success ? 'cached' : 'fallback',
          users: usersResult.success ? 'cached' : 'fallback',
          services: servicesResult.success ? 'cached' : 'fallback',
          locations: locationsResult.success ? 'cached' : 'fallback',
          cars: carsResult.success ? 'cached' : 'fallback'
        },
        reliability: {
          totalSources,
          availableSources: successfulSources,
          failedSources,
          successRate: Number((successfulSources / totalSources * 100).toFixed(1))
        }
      };

      // Add warnings only if there are significant issues affecting functionality
      if (failedSources.length > 0) {
        const criticalFailures = failedSources.filter(source => 
          ['appointments', 'users'].includes(source)
        );
        
        const impact = criticalFailures.length > 0 ? 'high' : 
                      failedSources.length >= totalSources / 2 ? 'medium' : 'low';
        
        if (impact !== 'low') {
          stats.warnings = {
            message: `${failedSources.length} data source${failedSources.length > 1 ? 's' : ''} temporarily unavailable`,
            details: failedSources.map(source => `${source} metrics may be incomplete`),
            impact
          };
        }
      }

      // Determine appropriate status code based on functionality impact
      // Return 200 if core functionality works (users + appointments available)
      // Return 206 only if critical sources fail
      const criticalSourcesAvailable = usersResult.success && appointmentsResult.success;
      const statusCode = criticalSourcesAvailable ? 200 : 
                        successfulSources > 0 ? 206 : 500;

      const duration = Date.now() - startTime;
      console.log(`[ADMIN_STATS] Request completed in ${duration}ms`, {
        successRate: stats.reliability.successRate,
        statusCode,
        failedSources: stats.reliability.failedSources
      });

      res.status(statusCode).json(stats);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enhanced error logging for admin visibility
      logAdminStatsError({
        operation: 'dashboard_statistics',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: 1,
        duration,
        context: {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          userId: req.user?.id
        }
      });

      console.error(`[ADMIN_STATS] Fatal error after ${duration}ms:`, error);
      
      res.status(500).json({ 
        message: "Failed to retrieve dashboard statistics",
        error: "Internal server error",
        code: "STATS_FETCH_FAILED",
        timestamp: new Date().toISOString(),
        reliability: {
          totalSources: 5,
          availableSources: 0,
          failedSources: ['appointments', 'users', 'services', 'locations', 'cars'],
          successRate: 0
        }
      });
    }
  }));

  // Admin Image Management API
  app.delete("/api/admin/images/profile/:userId", 
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "profile_image",
      rateLimit: 30, // Reasonable limit for image deletions
      validateInput: (req) => {
        const { userId } = req.params;
        if (!userId || typeof userId !== 'string') {
          return "Invalid user ID format";
        }
        return null;
      }
    }),
    asyncRoute("delete user profile image as admin", async (req: Request, res: Response) => {
      const { userId } = req.params;
      const storage = await getStorage();
      
      try {
        // Check if user exists and get their profile image
        const existingUser = await storage.getUser(userId);
        if (!existingUser) {
          await logAdminAction(req, res, {
            resourceId: userId,
            additionalInfo: `Attempted to delete profile image for non-existent user ${userId}`
          });
          return res.status(404).json({ 
            message: "User not found",
            code: "USER_NOT_FOUND"
          });
        }
        
        if (!existingUser.profileImage) {
          await logAdminAction(req, res, {
            resourceId: userId,
            additionalInfo: `User ${userId} has no profile image to delete`
          });
          return res.status(400).json({ 
            message: "User has no profile image to delete",
            code: "NO_PROFILE_IMAGE"
          });
        }
        
        // Delete the image files
        const deletionResult = await ImageService.deleteImagesForUser(userId, existingUser.profileImage);
        
        if (!deletionResult.success) {
          await logAdminAction(req, res, {
            resourceId: userId,
            additionalInfo: `Failed to delete profile image files: ${deletionResult.errors.join(', ')}`
          });
          return res.status(500).json({ 
            message: "Failed to delete image files",
            code: "DELETION_FAILED",
            errors: deletionResult.errors
          });
        }
        
        // Update user record to remove profile image reference
        await storage.updateUser(userId, { profileImage: null });
        
        // Log successful profile image deletion
        await logAdminAction(req, res, {
          resourceId: userId,
          additionalInfo: JSON.stringify({
            action: "delete_profile_image",
            deletedImageUrl: existingUser.profileImage,
            userName: existingUser.name,
            userEmail: existingUser.email
          })
        });
        
        res.json({ 
          success: true,
          message: "Profile image deleted successfully",
          deletedImageUrl: existingUser.profileImage
        });
        
      } catch (error) {
        // Log failed attempt
        await logAdminAction(req, res, {
          resourceId: userId,
          additionalInfo: `Error deleting profile image: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "delete profile image", res);
      }
    })
  );

  app.delete("/api/admin/images/car/:carId", 
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "car_image",
      rateLimit: 30, // Reasonable limit for image deletions
      validateInput: (req) => {
        const { carId } = req.params;
        if (!carId || typeof carId !== 'string') {
          return "Invalid car ID format";
        }
        return null;
      }
    }),
    asyncRoute("delete car image as admin", async (req: Request, res: Response) => {
      const { carId } = req.params;
      const storage = await getStorage();
      
      try {
        // Check if car exists and get its image
        const existingCar = await storage.getCar(carId);
        if (!existingCar) {
          await logAdminAction(req, res, {
            resourceId: carId,
            additionalInfo: `Attempted to delete image for non-existent car ${carId}`
          });
          return res.status(404).json({ 
            message: "Car not found",
            code: "CAR_NOT_FOUND"
          });
        }
        
        if (!existingCar.image) {
          await logAdminAction(req, res, {
            resourceId: carId,
            additionalInfo: `Car ${carId} has no image to delete`
          });
          return res.status(400).json({ 
            message: "Car has no image to delete",
            code: "NO_CAR_IMAGE"
          });
        }
        
        // Delete the image files
        const deletionResult = await ImageService.deleteImagesForCar(carId, existingCar.image);
        
        if (!deletionResult.success) {
          await logAdminAction(req, res, {
            resourceId: carId,
            additionalInfo: `Failed to delete car image files: ${deletionResult.errors.join(', ')}`
          });
          return res.status(500).json({ 
            message: "Failed to delete image files",
            code: "DELETION_FAILED",
            errors: deletionResult.errors
          });
        }
        
        // Update car record to remove image reference
        await storage.updateCar(carId, { image: "" });
        
        // Log successful car image deletion
        await logAdminAction(req, res, {
          resourceId: carId,
          additionalInfo: JSON.stringify({
            action: "delete_car_image",
            deletedImageUrl: existingCar.image,
            carMake: existingCar.make,
            carModel: existingCar.model,
            carYear: existingCar.year
          })
        });
        
        res.json({ 
          success: true,
          message: "Car image deleted successfully",
          deletedImageUrl: existingCar.image
        });
        
      } catch (error) {
        // Log failed attempt
        await logAdminAction(req, res, {
          resourceId: carId,
          additionalInfo: `Error deleting car image: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "delete car image", res);
      }
    })
  );

  // Services API
  app.get("/api/services", asyncRoute("fetch services", async (req: Request, res: Response) => {
    const result = await getCachedServices();
    
    if (!result.success) {
      console.error('[CACHE] Failed to get all services:', result.error);
      return sendError(res, "Failed to fetch services", 500);
    }
    
    res.json(result.data || []);
  }));

  app.get("/api/services/category/:category", asyncRoute("fetch services by category", async (req: Request, res: Response) => {
    const { category } = req.params;
    const result = await getCachedServicesByCategory(category);
    
    if (!result.success) {
      console.error(`[CACHE] Failed to get services by category ${category}:`, result.error);
      return sendError(res, "Failed to fetch services", 500);
    }
    
    res.json(result.data || []);
  }));

  app.get("/api/services/:id", asyncRoute("fetch service", async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await getCachedService(id);
    
    if (!result.success) {
      console.error(`[CACHE] Failed to get service ${id}:`, result.error);
      return sendError(res, "Failed to fetch service", 500);
    }
    
    if (!result.data) {
      return sendNotFoundError(res, "Service not found");
    }
    
    res.json(result.data);
  }));

  app.post("/api/services", 
    createEnhancedAdminMiddleware({
      action: "create",
      resource: "service",
      rateLimit: 30, // Reasonable limit for service creation
      validateInput: (req) => {
        const { name, description, price, category, duration, features } = req.body;
        
        if (!name || typeof name !== 'string') {
          return "Service name is required and must be a string";
        }
        if (!description || typeof description !== 'string') {
          return "Service description is required and must be a string";
        }
        if (!price || typeof price !== 'number' || price <= 0) {
          return "Service price is required and must be a positive number";
        }
        if (!category || typeof category !== 'string') {
          return "Service category is required and must be a string";
        }
        if (!duration || typeof duration !== 'number' || duration <= 0) {
          return "Service duration is required and must be a positive number";
        }
        // Check if features array is provided
        if (features !== undefined && !Array.isArray(features)) {
          return "Service features must be an array if provided";
        }
        return null;
      }
    }),
    asyncRoute("create service", async (req: Request, res: Response) => {
      try {
        const storage = await getStorage();
        const validatedData = insertServiceSchema.parse(req.body);
        const service = await storage.createService(validatedData);
        
        // Log successful service creation
        await logAdminAction(req, res, {
          resourceId: service.id,
          newValue: captureEntitySnapshot(service),
          additionalInfo: 'Service created successfully'
        });
        
        // Invalidate service caches after successful creation
        cacheManager.invalidateServiceCaches(service.id, service.category);
        
        res.status(201).json(service);
      } catch (error) {
        // Log failed attempt
        await logAdminAction(req, res, {
          additionalInfo: `Failed to create service: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "create service", res);
      }
    })
  );

  // Update service (admin only)
  app.put("/api/services/:id", 
    createEnhancedAdminMiddleware({
      action: "update",
      resource: "service",
      rateLimit: 40, // Reasonable limit for service updates
      validateInput: (req) => {
        const { id } = req.params;
        if (!id || typeof id !== 'string') {
          return "Invalid service ID format";
        }
        // Allow partial updates, so don't require all fields
        return null;
      }
    }),
    asyncRoute("update service", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const storage = await getStorage();
        
        // Check if service exists
        const existingService = await storage.getService(id);
        if (!existingService) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to update non-existent service ${id}`
          });
          return res.status(404).json({ 
            message: "Service not found",
            code: "SERVICE_NOT_FOUND"
          });
        }
        
        // Validate update data (allow partial updates)
        const validatedData = insertServiceSchema.partial().parse(req.body);
        const updatedService = await storage.updateService(id, validatedData);
        
        if (!updatedService) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Failed to update service ${id}`
          });
          return res.status(500).json({ 
            message: "Failed to update service",
            code: "UPDATE_FAILED"
          });
        }
        
        // Log successful service update
        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: captureEntitySnapshot(existingService),
          newValue: captureEntitySnapshot(updatedService),
          additionalInfo: 'Service updated successfully'
        });
        
        // Invalidate service caches after successful update
        // Use enhanced API to handle both old and new categories efficiently
        const prevCategory = existingService.category;
        const nextCategory = validatedData.category || prevCategory;
        cacheManager.invalidateServiceCaches(id, prevCategory, nextCategory);
        
        res.json(updatedService);
      } catch (error) {
        // Log failed attempt
        await logAdminAction(req, res, {
          resourceId: req.params.id,
          additionalInfo: `Error updating service: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "update service", res);
      }
    })
  );

  // Delete service (admin only)
  app.delete("/api/services/:id", 
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "service",
      rateLimit: 20, // More restrictive limit for deletions
      validateInput: (req) => {
        const { id } = req.params;
        if (!id || typeof id !== 'string') {
          return "Invalid service ID format";
        }
        return null;
      }
    }),
    asyncRoute("delete service", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const storage = await getStorage();
        
        // Check if service exists
        const existingService = await storage.getService(id);
        if (!existingService) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to delete non-existent service ${id}`
          });
          return res.status(404).json({ 
            message: "Service not found",
            code: "SERVICE_NOT_FOUND"
          });
        }
        
        // Check if service is used in any appointments
        const appointments = await storage.getAppointmentsByService(id);
        if (appointments && appointments.length > 0) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to delete service ${id} with ${appointments.length} existing appointments`
          });
          return res.status(400).json({ 
            message: "Cannot delete service with existing appointments. Please cancel or complete all appointments first.",
            code: "SERVICE_IN_USE",
            appointmentCount: appointments.length
          });
        }
        
        await storage.deleteService(id);
        
        // Log successful service deletion
        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: captureEntitySnapshot(existingService),
          additionalInfo: 'Service deleted successfully'
        });
        
        // Invalidate service caches after successful deletion
        cacheManager.invalidateServiceCaches(id, existingService.category);
        
        res.status(204).send();
      } catch (error) {
        // Log failed attempt
        await logAdminAction(req, res, {
          resourceId: req.params.id,
          additionalInfo: `Error deleting service: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "delete service", res);
      }
    })
  );

  // Customers API
  app.post("/api/customers", requireAuth, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const user = req.user as any;
      
      // Security: Always enforce userId to authenticated user, prevent mass-assignment
      const requestData = { ...req.body, userId: user.id };
      const validatedData = insertCustomerSchema.parse(requestData);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create customer", res);
    }
  });

  // REMOVED: GET /api/customers/email/:email - Email enumeration vulnerability
  // Secure replacement: authenticated customer lookup/creation for current user only
  app.post("/api/customers/ensure-own", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const storage = await getStorage();
      
      // First try to find existing customer by userId (preferred method)
      let customer = await storage.getCustomerByUserId(user.id);
      
      // Fall back to finding by email for backward compatibility
      if (!customer) {
        customer = await storage.getCustomerByEmail(user.email);
        
        // If found by email but userId is missing, backfill the relationship
        if (customer && !customer.userId) {
          try {
            const updatedCustomer = await storage.updateCustomer(customer.id, { userId: user.id });
            customer = updatedCustomer || customer; // Use updated version if successful
          } catch (error) {
            // If update fails (e.g., due to unique constraint), continue with existing customer
            console.warn("Failed to backfill userId for customer", customer.id, error);
          }
        }
      }
      
      if (!customer) {
        // Customer doesn't exist, create one linked to the authenticated user
        const customerData = {
          userId: user.id, // Link to user account
          name: user.name || "User",
          email: user.email,
          phone: user.phone || "Not provided", // Use user's phone if available
          countryCode: user.countryCode || "+91"
        };
        
        const validatedData = insertCustomerSchema.parse(customerData);
        customer = await storage.createCustomer(validatedData);
      }
      
      res.json(customer);
    } catch (error) {
      handleApiError(error, "ensure customer", res);
    }
  });

  // Customer by User endpoint - needed for frontend appointment queries
  app.get("/api/customer/by-user/:userId", requireAuth, asyncRoute("get customer by user ID", async (req: Request, res: Response) => {
    const { userId } = req.params;
    const user = req.user as any;
    
    // Authorization: user can only access their own customer record
    if (user.id !== userId) {
      return res.status(403).json({ message: "Unauthorized: You can only access your own customer information" });
    }
    
    const storage = await getStorage();
    const customer = await storage.getCustomerByUserId(userId);
    
    // Return customer data or null if not found (don't return 404, just null)
    res.json(customer || null);
  }));

  // Admin Routes - must be defined before other appointment routes
  app.get("/api/admin/appointments", requireAdmin, asyncRoute("fetch all appointments for admin", async (req: Request, res: Response) => {
    const storage = await getStorage();
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const [appointments, totalCount] = await Promise.all([
      storage.getAllAppointments(offset, limit),
      storage.getAppointmentCount()
    ]);
    
    res.json({
      appointments,
      total: totalCount,
      offset,
      limit,
      hasMore: appointments.length === limit
    });
  }));

  app.patch("/api/admin/appointments/:id/status", 
    createEnhancedAdminMiddleware({
      action: "status_update",
      resource: "appointment",
      rateLimit: 50, // Reasonable limit for appointment status updates
      validateInput: (req) => {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!id || typeof id !== 'string') {
          return "Invalid appointment ID format";
        }
        if (!status || typeof status !== 'string') {
          return "Status is required and must be a string";
        }
        if (!["pending", "confirmed", "in-progress", "completed", "cancelled"].includes(status)) {
          return "Invalid status. Status must be one of: pending, confirmed, in-progress, completed, cancelled";
        }
        return null;
      }
    }),
    asyncRoute("update appointment status as admin", async (req: Request, res: Response) => {
      const { id } = req.params;
      const { status } = req.body;
      const storage = await getStorage();
      
      try {
        // Check if appointment exists
        const existingAppointment = await storage.getAppointment(id);
        if (!existingAppointment) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to update non-existent appointment ${id}`
          });
          return res.status(404).json({ 
            message: "Appointment not found",
            code: "APPOINTMENT_NOT_FOUND"
          });
        }
        
        // Store old status for audit
        const oldStatus = existingAppointment.status;
        
        // Prevent unnecessary updates
        if (oldStatus === status) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `No change needed - appointment ${id} already has status: ${status}`
          });
          return res.status(200).json({ 
            message: "Appointment status is already set to the requested value",
            appointmentId: id,
            status: status,
            code: "NO_CHANGE_NEEDED"
          });
        }
        
        // Update appointment status
        const success = await storage.updateAppointmentStatus(id, status);
        if (!success) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Failed to update appointment ${id} status from ${oldStatus} to ${status}`
          });
          return res.status(500).json({ 
            message: "Failed to update appointment status",
            code: "UPDATE_FAILED"
          });
        }
        
        // Log successful status change
        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: { status: oldStatus },
          newValue: { status: status },
          additionalInfo: `Appointment status changed from ${oldStatus} to ${status}`
        });
        
        res.json({ 
          message: "Appointment status updated successfully",
          appointmentId: id,
          oldStatus,
          newStatus: status,
          code: "SUCCESS"
        });
      } catch (error) {
        console.error("Error updating appointment status:", error);
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Error updating appointment ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        return res.status(500).json({ 
          message: "Internal server error during appointment update",
          code: "INTERNAL_ERROR"
        });
      }
    })
  );

  // Conflict checking endpoint
  app.post("/api/appointments/check-conflict", requireAuth, asyncRoute("check appointment conflict", async (req: Request, res: Response) => {
    const { locationId, dateTime } = req.body;
    
    if (!locationId || !dateTime) {
      return res.status(400).json({ 
        message: "locationId and dateTime are required" 
      });
    }
    
    const storage = await getStorage();
    const hasConflict = await storage.checkAppointmentConflict(
      locationId, 
      new Date(dateTime)
    );
    
    res.json({ hasConflict });
  }));

  // Appointments API
  app.get("/api/appointments/customer/:customerId", requireAuth, asyncRoute("fetch customer appointments", async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const user = req.user as any;
    const storage = await getStorage();
    
    // Verify the customer exists
    const customer = await storage.getCustomer(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Ownership validation: user can only access their own appointments  
    // Use direct user ID relationship instead of fragile email comparison
    if (customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only access your own appointments" 
      });
    }
    
    const appointments = await storage.getAppointmentsByCustomer(customerId);
    res.json(appointments);
  }));

  app.get("/api/appointments/:id", requireAuth, asyncRoute("fetch appointment", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();
    
    // Get the appointment with details (includes service, location, and customer names)
    const appointment = await storage.getAppointmentWithDetails(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Authorization check: Admin users can access any appointment, 
    // regular users can only access appointments they own
    if (user.role !== "admin") {
      // Get the customer associated with this appointment
      const customer = await storage.getCustomer(appointment.customerId);
      if (!customer || customer.userId !== user.id) {
        return res.status(403).json({ 
          message: "Unauthorized: You can only access your own appointments" 
        });
      }
    }
    
    res.json(appointment);
  }));

  app.post("/api/appointments", requireAuth, asyncRoute("create appointment", async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const user = req.user as any;
      const validatedData = insertAppointmentSchema.parse(req.body);
      
      // Ensure customer record exists for the authenticated user
      let customer = await storage.getCustomerByUserId(user.id);
      if (!customer) {
        // Customer doesn't exist, create one linked to the authenticated user
        const customerData = {
          userId: user.id, // Link to user account
          name: user.name || "User",
          email: user.email || `user-${user.id}@example.com`, // Fallback email if none
          phone: user.phone || "Not provided", // Use user's phone if available
          countryCode: user.countryCode || "+91"
        };
        
        const validatedCustomerData = insertCustomerSchema.parse(customerData);
        customer = await storage.createCustomer(validatedCustomerData);
      }
      
      // Ensure the appointment uses the correct customer ID
      const appointmentWithCustomer = {
        ...validatedData,
        customerId: customer.id
      };
      
      const appointment = await storage.createAppointment(appointmentWithCustomer);
      
      // Send appointment confirmation notifications asynchronously (non-blocking)
      try {
        const customer = await storage.getCustomer(appointment.customerId);
        const service = await storage.getService(appointment.serviceId);
        const location = await storage.getLocation(appointment.locationId);
        
        if (customer && service && location) {
          const appointmentData = {
            customerName: customer.name,
            serviceName: service.title,
            dateTime: new Date(appointment.dateTime).toLocaleString('en-IN'),
            location: location.name,
            carDetails: appointment.carDetails,
            mechanicName: appointment.mechanicName || undefined,
            price: appointment.price || undefined,
            bookingId: appointment.id
          };

          // Send email confirmation
          EmailNotificationService.sendAppointmentConfirmationAsync(customer.email, appointmentData);
          console.log(`[APPOINTMENT] Confirmation email queued for ${customer.email}`);
          
          // Send WhatsApp confirmation if customer has phone number
          if (customer.phone && customer.countryCode) {
            // Send WhatsApp confirmation asynchronously
            WhatsAppService.sendAppointmentConfirmation(
              customer.phone,
              customer.countryCode,
              appointmentData,
              appointment.id
            ).then((result) => {
              if (result.success) {
                console.log(`[APPOINTMENT] WhatsApp confirmation sent to ${customer.countryCode}${customer.phone}`);
              } else {
                console.error(`[APPOINTMENT] WhatsApp confirmation failed: ${result.error}`);
              }
            }).catch((error) => {
              console.error(`[APPOINTMENT] WhatsApp confirmation error: ${error.message}`);
            });
          } else {
            console.log("[APPOINTMENT] No phone number available for WhatsApp confirmation");
          }

          // Send WhatsApp notification to service provider if contact info is available
          if (service.providerPhone && service.providerCountryCode) {
            const serviceProviderData = {
              providerName: service.providerName || service.title,
              customerName: customer.name,
              serviceName: service.title,
              dateTime: new Date(appointment.dateTime).toLocaleString('en-IN'),
              location: location.name,
              carDetails: appointment.carDetails,
              bookingId: appointment.id,
              customerPhone: customer.phone ? `${customer.countryCode}${customer.phone}` : undefined,
              price: appointment.price || undefined
            };

            // Send WhatsApp notification to service provider asynchronously
            WhatsAppService.sendServiceProviderBookingNotification(
              service.providerPhone,
              service.providerCountryCode,
              serviceProviderData,
              appointment.id
            ).then((result) => {
              if (result.success) {
                console.log(`[APPOINTMENT] Service provider notification sent to ${service.providerCountryCode}${service.providerPhone}`);
              } else {
                console.error(`[APPOINTMENT] Service provider notification failed: ${result.error}`);
              }
            }).catch((error) => {
              console.error(`[APPOINTMENT] Service provider notification error: ${error.message}`);
            });
          } else {
            console.log("[APPOINTMENT] No service provider contact information available for WhatsApp notification");
          }
        } else {
          console.error("[APPOINTMENT] Missing customer, service, or location data for notifications");
        }
      } catch (notificationError: unknown) {
        console.error(`[APPOINTMENT] Notification setup failed: ${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`);
      }
      
      // Return appointment immediately without waiting for email
      res.status(201).json(appointment);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create appointment", res);
    }
  }));

  app.patch("/api/appointments/:id/status", requireAuth, asyncRoute("update appointment status", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status is provided
    if (!status || typeof status !== "string") {
      return res.status(400).json({ message: "Status is required" });
    }
    
    // Validate status is one of allowed values
    const allowedStatuses = ["pending", "confirmed", "in-progress", "completed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}` 
      });
    }
    
    const storage = await getStorage();
    const user = req.user as any;
    
    // Get current appointment to validate status transition and ownership
    const currentAppointment = await storage.getAppointment(id);
    if (!currentAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Check ownership - user must own the appointment or be admin
    // Use direct user ID relationship instead of fragile email comparison
    const customer = await storage.getCustomer(currentAppointment.customerId);
    if (!customer || customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only update your own appointments" 
      });
    }
    
    // Validate status transition is logical
    const validTransitions: { [key: string]: string[] } = {
      "pending": ["confirmed", "cancelled"],
      "confirmed": ["in-progress", "cancelled"],
      "in-progress": ["completed", "cancelled"],
      "completed": [], // Final state
      "cancelled": []  // Final state
    };
    
    if (!validTransitions[currentAppointment.status]?.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from '${currentAppointment.status}' to '${status}'` 
      });
    }
    
    // Atomic conflict checking is now handled in storage layer for "confirmed" status
    const updatedAppointment = await storage.updateAppointmentStatus(id, status);
    
    // Send notifications for status updates with feedback
    let statusEmailSent = false;
    let statusWhatsAppSent = false;
    try {
      const service = await storage.getService(updatedAppointment!.serviceId);
      const location = await storage.getLocation(updatedAppointment!.locationId);
      
      if (customer && service && location) {
        const statusData = {
          customerName: customer.name,
          serviceName: service.title,
          dateTime: new Date(updatedAppointment!.dateTime).toLocaleString('en-IN'),
          location: location.name,
          carDetails: updatedAppointment!.carDetails,
          mechanicName: updatedAppointment!.mechanicName || undefined,
          price: updatedAppointment!.price || undefined,
          status: status,
          bookingId: updatedAppointment!.id
        };

        // Send email notification
        statusEmailSent = await EmailNotificationService.sendAppointmentStatusUpdate(customer.email, statusData);
        
        if (!statusEmailSent) {
          console.error("Email service unavailable for status update notification");
        }

        // Send WhatsApp status update if customer has phone number
        if (customer.phone && customer.countryCode) {
          try {
            const whatsappResult = await WhatsAppService.sendStatusUpdate(
              customer.phone,
              customer.countryCode,
              statusData,
              updatedAppointment!.id
            );
            statusWhatsAppSent = whatsappResult.success;
            
            if (statusWhatsAppSent) {
              console.log(`[STATUS] WhatsApp update sent to ${customer.countryCode}${customer.phone}`);
            } else {
              console.error(`[STATUS] WhatsApp update failed: ${whatsappResult.error}`);
            }
          } catch (whatsappError: unknown) {
            console.error(`[STATUS] WhatsApp update error: ${whatsappError instanceof Error ? whatsappError.message : 'Unknown error'}`);
            statusWhatsAppSent = false;
          }
        } else {
          console.log("[STATUS] No phone number available for WhatsApp update");
        }
      }
    } catch (notificationError: unknown) {
      console.error("Failed to send status update notifications:", notificationError instanceof Error ? notificationError.message : 'Unknown error');
      statusEmailSent = false;
      statusWhatsAppSent = false;
    }
    
    res.json({
      message: "Appointment status updated successfully",
      appointment: updatedAppointment,
      notifications: {
        email: {
          sent: statusEmailSent,
          message: statusEmailSent 
            ? "Status update email sent successfully"
            : "Status updated but notification email could not be sent"
        },
        whatsapp: {
          sent: statusWhatsAppSent,
          message: statusWhatsAppSent
            ? "Status update WhatsApp message sent successfully"
            : customer?.phone && customer?.countryCode
              ? "Status updated but WhatsApp message could not be sent"
              : "No phone number available for WhatsApp notification"
        }
      }
    });
  }));

  // Reschedule appointment with full security and validation
  app.patch("/api/appointments/:id/reschedule", requireAuth, asyncRoute("reschedule appointment", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user as any;
      
      // Validate the reschedule payload
      const validationResult = rescheduleAppointmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => err.message).join(", ");
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: errorMessages 
        });
      }
      
      const { dateTime, locationId } = validationResult.data;
      const storage = await getStorage();
      
      // Check if appointment exists
      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Authorization: Check if user owns the appointment or has admin role
      // Admin users can reschedule any appointment, regular users can only reschedule their own
      const customer = await storage.getCustomer(appointment.customerId);
      
      // Check if user is admin
      const isAdmin = user.role === 'admin';
      
      // Allow if user is admin OR if user owns the appointment (via user ID relationship)
      if (!isAdmin && (!customer || customer.userId !== user.id)) {
        return res.status(403).json({ message: "You can only reschedule your own appointments" });
      }
      
      // Verify appointment is in a reschedulable state
      if (appointment.status !== "confirmed") {
        return res.status(400).json({ 
          message: `Cannot reschedule appointment with status '${appointment.status}'. Only confirmed appointments can be rescheduled.` 
        });
      }
      
      // Verify the location exists
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(400).json({ message: "Invalid location ID. The specified location does not exist." });
      }
      
      // Check for appointment conflicts at the new time slot
      const hasConflict = await storage.checkAppointmentConflict(
        locationId, 
        new Date(dateTime), 
        id // exclude current appointment from conflict check
      );
      
      if (hasConflict) {
        return res.status(409).json({ 
          message: "Time slot conflict. Another appointment is already scheduled at this location and time. Please choose a different time." 
        });
      }
      
      // All checks passed - perform the reschedule
      const rescheduledAppointment = await storage.rescheduleAppointment(id, dateTime, locationId);
      if (!rescheduledAppointment) {
        return res.status(500).json({ message: "Failed to update appointment. Please try again." });
      }
      
      res.json({
        message: "Appointment rescheduled successfully",
        appointment: rescheduledAppointment
      });
      
    } catch (error) {
      console.error("Reschedule appointment error:", error);
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to reschedule appointment. Please try again." });
      }
    }
  }));

  // Cars API
  app.get("/api/cars", async (req, res) => {
    try {
      const offset = parseInt(req.query.offset as string);
      const limit = parseInt(req.query.limit as string);
      
      const filters: CarFilterOptions = {};
      
      if (req.query.transmission) {
        filters.transmission = req.query.transmission as string;
      }
      
      if (req.query.bodyType) {
        filters.bodyType = req.query.bodyType as string;
      }
      
      if (req.query.color) {
        filters.color = req.query.color as string;
      }
      
      if (req.query.yearMin) {
        const yearMin = parseInt(req.query.yearMin as string);
        if (!isNaN(yearMin)) {
          filters.yearMin = yearMin;
        }
      }
      
      if (req.query.yearMax) {
        const yearMax = parseInt(req.query.yearMax as string);
        if (!isNaN(yearMax)) {
          filters.yearMax = yearMax;
        }
      }
      
      if (req.query.mileageMin) {
        const mileageMin = parseInt(req.query.mileageMin as string);
        if (!isNaN(mileageMin)) {
          filters.mileageMin = mileageMin;
        }
      }
      
      if (req.query.mileageMax) {
        const mileageMax = parseInt(req.query.mileageMax as string);
        if (!isNaN(mileageMax)) {
          filters.mileageMax = mileageMax;
        }
      }
      
      if (req.query.sortBy && ['price', 'year', 'mileage'].includes(req.query.sortBy as string)) {
        filters.sortBy = req.query.sortBy as 'price' | 'year' | 'mileage';
      }
      
      if (req.query.sortOrder && ['asc', 'desc'].includes(req.query.sortOrder as string)) {
        filters.sortOrder = req.query.sortOrder as 'asc' | 'desc';
      }
      
      const hasFilters = Object.keys(filters).length > 0;
      
      // If pagination parameters or filters are provided, bypass cache and fetch filtered/sorted data
      if (!isNaN(offset) && !isNaN(limit)) {
        const storage = await getStorage();
        const [cars, totalCount] = await Promise.all([
          storage.getAllCars(offset, limit, hasFilters ? filters : undefined),
          storage.getCarCount(hasFilters ? filters : undefined)
        ]);
        
        return res.json({
          cars,
          total: totalCount,
          offset,
          limit,
          hasMore: cars.length === limit
        });
      }
      
      // If only filters/sorting but no pagination, fetch all filtered cars
      if (hasFilters) {
        const storage = await getStorage();
        const cars = await storage.getAllCars(0, 100, filters);
        return res.json(cars);
      }
      
      // Default behavior: use cached data for all cars (for public listing)
      const result = await getCachedCars();
      
      if (!result.success) {
        console.error('[CACHE] Failed to get all cars:', result.error);
        return res.status(500).json({ message: "Failed to fetch cars" });
      }
      
      res.json(result.data || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars" });
    }
  });

  app.get("/api/cars/sale", async (req, res) => {
    try {
      const storage = await getStorage();
      const cars = await storage.getCarsForSale();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars for sale" });
    }
  });

  app.get("/api/cars/auctions", async (req, res) => {
    try {
      const storage = await getStorage();
      const cars = await storage.getAuctionCars();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auction cars" });
    }
  });

  app.get("/api/cars/:id", asyncRoute("fetch car", async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await getCachedCar(id);
    
    if (!result.success) {
      console.error(`[CACHE] Failed to get car ${id}:`, result.error);
      return sendError(res, "Failed to fetch car", 500);
    }
    
    if (!result.data) {
      return sendNotFoundError(res, "Car not found");
    }
    
    res.json(result.data);
  }));

  app.post("/api/cars", requireAdmin, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const validatedData = insertCarSchema.parse(req.body);
      const car = await storage.createCar(validatedData);
      
      // Log successful car creation
      await logAdminAction(req, res, {
        resourceId: car.id,
        newValue: captureEntitySnapshot(car),
        additionalInfo: 'Car created successfully'
      });
      
      // Invalidate car caches after successful creation
      cacheManager.invalidateCarCaches(car.id);
      
      res.status(201).json(car);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create car" });
      }
    }
  });

  // Car image endpoints
  app.post("/api/cars/:id/images", requireAdmin, asyncRoute("upload car image", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();
    
    // Validate the car exists first
    const car = await storage.getCar(id);
    if (!car) {
      return sendNotFoundError(res, "Car not found");
    }
    
    // Validate the request body
    const validatedData = insertCarImageSchema.parse({
      carId: id,
      ...req.body
    });
    
    // Create the car image
    const carImage = await storage.createCarImage(validatedData);
    
    // Invalidate car caches after successful image upload
    cacheManager.invalidateCarCaches(id);
    
    sendResourceCreated(res, carImage, "Car image uploaded successfully");
  }));

  app.delete("/api/cars/images/:imageId", requireAdmin, asyncRoute("delete car image", async (req: Request, res: Response) => {
    const { imageId } = req.params;
    const storage = await getStorage();
    
    // Delete the car image by ID
    await storage.deleteCarImage(imageId);
    
    // Invalidate car caches
    cacheManager.invalidateCarCaches();
    
    sendResourceDeleted(res, "Car image deleted successfully");
  }));

  // Bid endpoints - RE-ENABLED
  app.post("/api/cars/:carId/bids", requireAuth, async (req, res) => {
    try {
      const { carId } = req.params;
      const user = req.user as any;
      const storage = await getStorage();
      
      // Validate the bid payload
      const validationResult = placeBidSchema.safeParse({ ...req.body, carId });
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => err.message).join(", ");
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: errorMessages 
        });
      }
      
      const { bidAmount } = validationResult.data;
      
      // Check if car exists and is auction
      const car = await storage.getCar(carId);
      if (!car) {
        return res.status(404).json({ message: "Car not found" });
      }
      
      if (!car.isAuction) {
        return res.status(400).json({ message: "This car is not available for auction" });
      }
      
      // Check if auction is still active
      if (car.auctionEndTime && new Date() > new Date(car.auctionEndTime)) {
        return res.status(400).json({ message: "Auction has ended" });
      }
      
      // Check if bid is higher than current bid
      const currentHighestBid = await storage.getHighestBidForCar(carId);
      const minimumBid = currentHighestBid ? currentHighestBid.bidAmount + 1000 : car.price;
      
      if (bidAmount < minimumBid) {
        return res.status(400).json({ 
          message: `Bid must be at least ₹${minimumBid.toLocaleString('en-IN')}` 
        });
      }
      
      // Place the bid
      const bid = await storage.placeBid({
        carId,
        bidderEmail: user.email,
        bidAmount
      });
      
      // Update car's current bid
      await storage.updateCarCurrentBid(carId, bidAmount);
      
      // Send bid confirmation WhatsApp message asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const carDetails = `${car.make} ${car.model} ${car.year}`;
          
          // Find current bidder (new highest bidder) and send confirmation
          const currentBidder = await storage.getCustomerByEmail(user.email);
          
          if (currentBidder && currentBidder.phone && currentBidder.countryCode) {
            const result = await WhatsAppService.sendBidNotification(
              currentBidder.phone,
              currentBidder.countryCode,
              {
                customerName: currentBidder.name,
                carDetails: carDetails,
                bidAmount: bidAmount,
                bidId: bid.id
              }
            );
            
            if (result.success) {
              console.log(`[BID] WhatsApp confirmation sent to bidder ${currentBidder.countryCode}${currentBidder.phone}`);
            } else {
              console.error(`[BID] WhatsApp confirmation failed: ${result.error}`);
            }
          } else {
            console.log("[BID] No phone number available for WhatsApp confirmation");
          }
          
        } catch (notificationError: unknown) {
          console.error(`[BID] WhatsApp notification failed: ${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`);
        }
      });
      
      res.status(201).json({
        message: "Bid placed successfully",
        bid
      });
      
    } catch (error) {
      console.error("Place bid error:", error);
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to place bid" });
      }
    }
  });

  app.get("/api/cars/:carId/bids", async (req, res) => {
    try {
      const { carId } = req.params;
      const storage = await getStorage();
      
      // Check if car exists using cached variant
      const carResult = await getCachedCar(carId);
      if (!carResult.success || !carResult.data) {
        return res.status(404).json({ message: "Car not found" });
      }
      
      // Get all bids for the car
      const bids = await storage.getBidsForCar(carId);
      res.json(bids);
      
    } catch (error) {
      console.error("Get bids error:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  // Contacts API
  app.post("/api/contacts", requireAuth, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const validatedData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validatedData);
      res.status(201).json(contact);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create contact" });
      }
    }
  });

  // Locations API
  app.get("/api/locations", async (req: Request, res: Response) => {
    try {
      const result = await getCachedLocations();
      
      if (!result.success) {
        console.error('[CACHE] Failed to get all locations:', result.error);
        return res.status(500).json({ message: "Failed to fetch locations" });
      }
      
      res.json(result.data || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get("/api/locations/:id", asyncRoute("fetch location", async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await getCachedLocation(id);
    
    if (!result.success) {
      console.error(`[CACHE] Failed to get location ${id}:`, result.error);
      return sendError(res, "Failed to fetch location", 500);
    }
    
    if (!result.data) {
      return sendNotFoundError(res, "Location not found");
    }
    
    res.json(result.data);
  }));

  app.post("/api/locations", requireAdmin, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const validatedData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(validatedData);
      
      // Log successful location creation
      await logAdminAction(req, res, {
        resourceId: location.id,
        newValue: captureEntitySnapshot(location),
        additionalInfo: 'Location created successfully'
      });
      
      // Invalidate location caches after successful creation
      cacheManager.invalidateLocationCaches(location.id);
      
      res.status(201).json(location);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create location" });
      }
    }
  });

  app.put("/api/locations/:id", requireAdmin, asyncRoute("update location", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();
    
    // Validate the update data
    const validatedData = insertLocationSchema.parse(req.body);
    
    // Check if location exists using cached variant
    const locationResult = await getCachedLocation(id);
    if (!locationResult.success || !locationResult.data) {
      return res.status(404).json({ message: "Location not found" });
    }
    const existingLocation = locationResult.data;
    
    const updatedLocation = await storage.updateLocation(id, validatedData);
    
    // Log successful location update
    await logAdminAction(req, res, {
      resourceId: id,
      oldValue: captureEntitySnapshot(existingLocation),
      newValue: captureEntitySnapshot(updatedLocation),
      additionalInfo: 'Location updated successfully'
    });
    
    // Invalidate location caches after successful update
    cacheManager.invalidateLocationCaches(id);
    
    res.json(updatedLocation);
  }));

  app.delete("/api/locations/:id", requireAdmin, asyncRoute("delete location", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();
    
    // Check if location exists using cached variant
    const locationResult = await getCachedLocation(id);
    if (!locationResult.success || !locationResult.data) {
      return res.status(404).json({ message: "Location not found" });
    }
    const existingLocation = locationResult.data;
    
    // Check if location has any appointments
    const hasAppointments = await storage.hasLocationAppointments(id);
    if (hasAppointments) {
      return res.status(400).json({ 
        message: "Cannot delete location with existing appointments. Please reassign or cancel appointments first." 
      });
    }
    
    await storage.deleteLocation(id);
    
    // Log successful location deletion
    await logAdminAction(req, res, {
      resourceId: id,
      oldValue: captureEntitySnapshot(existingLocation),
      additionalInfo: 'Location deleted successfully'
    });
    
    // Invalidate location caches after successful deletion
    cacheManager.invalidateLocationCaches(id);
    
    res.json({ message: "Location deleted successfully" });
  }));

  // Image Upload Routes
  
  // Upload profile image
  app.post("/api/upload/profile", requireAuth, profileUpload.single('profileImage'), asyncRoute("upload profile image", async (req: Request, res: Response) => {
    const user = req.user;
    
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const filename = `profile-${user.id}-${Date.now()}`;
    const outputPath = path.join('public/uploads/profiles', filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {
      // Validate the uploaded image
      const isValid = await ImageService.validateImage(inputPath);
      if (!isValid) {
        await ImageService.deleteImage(inputPath);
        return res.status(400).json({ message: "Invalid image file. Please upload a valid image." });
      }

      // Queue image processing in background
      const jobId = ImageService.processProfileImageAsync(
        inputPath,
        outputPath,
        thumbnailPath,
        user.id
      );

      // Return immediately with placeholder
      const placeholderUrl = `/uploads/profiles/processing-placeholder.jpg`;
      
      res.json({ 
        processing: true,
        jobId,
        message: "Image upload successful, processing in background",
        imageUrl: placeholderUrl
      });
    } catch (error) {
      // Clean up file on error
      await ImageService.deleteImage(inputPath);
      console.error('Profile image upload error:', error);
      return res.status(500).json({
        message: 'Profile image upload failed. Please try again later.'
      });
    }
  }));

  // Upload car image
  app.post("/api/upload/car", requireAuth, carUpload.single('carImage'), asyncRoute("upload car image", async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const filename = `car-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const outputPath = path.join('public/uploads/cars', filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {
      // Validate the uploaded image
      const isValid = await ImageService.validateImage(inputPath);
      if (!isValid) {
        await ImageService.deleteImage(inputPath);
        return res.status(400).json({ message: "Invalid image file. Please upload a valid image." });
      }

      // Queue image processing in background
      const jobId = ImageService.processCarImageAsync(
        inputPath,
        outputPath,
        thumbnailPath
      );

      // Return immediately with placeholder
      const placeholderUrl = `/uploads/cars/processing-placeholder.jpg`;
      
      res.json({ 
        processing: true,
        jobId,
        message: "Image upload successful, processing in background",
        imageUrl: placeholderUrl,
        filename: filename
      });
    } catch (error) {
      // Clean up file on error
      await ImageService.deleteImage(inputPath);
      console.error('Car image upload error:', error);
      return res.status(500).json({
        message: 'Car image upload failed. Please try again later.'
      });
    }
  }));

  // Get job status
  app.get("/api/upload/status/:jobId", requireAuth, asyncRoute("get job status", async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const { imageProcessingQueue } = require('./image-processing-queue');
    
    const job = imageProcessingQueue.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({ 
        message: "Job not found" 
      });
    }

    const response: {
      jobId: string;
      status: string;
      processing: boolean;
      message?: string;
      imageUrl?: string;
      imageUrls?: { webp: string; jpeg: string; fallback: string };
      thumbnailUrls?: { webp: string; jpeg: string; fallback: string };
      error?: string;
    } = {
      jobId: job.id,
      status: job.status,
      processing: job.status === 'pending' || job.status === 'processing'
    };

    if (job.status === 'completed' && job.result) {
      response.message = 'Image processing completed successfully';
      response.imageUrl = job.result.imageUrl;
      response.imageUrls = job.result.imageUrls;
      if (job.result.thumbnailUrls) {
        response.thumbnailUrls = job.result.thumbnailUrls;
      }
    } else if (job.status === 'failed') {
      response.message = 'Image processing failed';
      response.error = job.error || 'Unknown error';
    } else {
      response.message = `Image processing ${job.status}`;
    }

    res.json(response);
  }));

  // Replace profile image - PUT /api/upload/profile/replace/:filename
  app.put("/api/upload/profile/replace/:filename", requireAuth, profileUpload.single('profileImage'), asyncRoute("replace profile image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const user = req.user;
    const storage = await getStorage();

    // Validate ownership - user can only replace their own profile image
    const currentUser = await storage.getUser(user.id);
    if (!currentUser || !currentUser.profileImage) {
      return res.status(404).json({ message: "No profile image found to replace" });
    }

    // Extract filename from current profile image URL
    const currentFilename = currentUser.profileImage.split('/').pop();
    if (currentFilename !== filename) {
      return res.status(403).json({ message: "Unauthorized: You can only replace your own profile image" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const newFilename = `profile-${user.id}-${Date.now()}.jpg`;
    const outputPath = path.join('public/uploads/profiles', newFilename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${newFilename}`);

    try {
      // Validate the uploaded image
      const isValid = await ImageService.validateImage(inputPath);
      if (!isValid) {
        await ImageService.deleteImage(inputPath);
        return res.status(400).json({ message: "Invalid image file. Please upload a valid image." });
      }

      // Process the new image
      await ImageService.processProfileImage(inputPath, outputPath);
      await ImageService.createThumbnail(outputPath, thumbnailPath);

      // Delete old image files
      const oldImagePath = path.join('public/uploads/profiles', filename);
      await ImageService.deleteImageWithThumbnail(oldImagePath, 'profiles');

      // Update user's profile image URL
      const imageUrl = ImageService.generateImageUrl(newFilename, 'profiles');
      await storage.updateUser(user.id, { profileImage: imageUrl });

      // Clean up original uploaded file
      await ImageService.deleteImage(inputPath);

      res.json({ 
        message: "Profile image replaced successfully",
        imageUrl: imageUrl
      });
    } catch (error) {
      // Clean up files on error
      await ImageService.deleteImage(inputPath);
      await ImageService.deleteImage(outputPath);
      await ImageService.deleteImage(thumbnailPath);
      console.error('Profile image replace error:', error);
      return res.status(500).json({
        message: 'Profile image replacement failed. Please try again later.'
      });
    }
  }));

  // Replace car image - PUT /api/upload/car/replace/:filename  
  app.put("/api/upload/car/replace/:filename", requireAdmin, carUpload.single('carImage'), asyncRoute("replace car image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const storage = await getStorage();

    // Find car with this image filename using exact path segment matching
    const allCars = await storage.getAllCars();
    const carWithImage = allCars.find(car => {
      if (!car.image) return false;
      // Extract the last path segment from car.image and compare for strict equality
      const carImageFilename = car.image.split('/').pop();
      return carImageFilename === filename;
    });
    
    if (!carWithImage) {
      return res.status(404).json({ message: "Car with specified image not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const newFilename = `car-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
    const outputPath = path.join('public/uploads/cars', newFilename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${newFilename}`);

    try {
      // Validate the uploaded image
      const isValid = await ImageService.validateImage(inputPath);
      if (!isValid) {
        await ImageService.deleteImage(inputPath);
        return res.status(400).json({ message: "Invalid image file. Please upload a valid image." });
      }

      // Process the new image
      await ImageService.processCarImage(inputPath, outputPath);
      await ImageService.createThumbnail(outputPath, thumbnailPath);

      // Delete old image files
      const oldImagePath = path.join('public/uploads/cars', filename);
      await ImageService.deleteImageWithThumbnail(oldImagePath, 'cars');

      // Update car's image URL
      const imageUrl = ImageService.generateImageUrl(newFilename, 'cars');
      await storage.updateCar(carWithImage.id, { image: imageUrl });

      // Log successful car image replacement
      await logAdminAction(req, res, {
        resourceId: carWithImage.id,
        oldValue: { filename: filename, type: 'car' },
        newValue: { filename: newFilename, type: 'car' },
        additionalInfo: 'Car image replaced successfully'
      });

      // Clean up original uploaded file
      await ImageService.deleteImage(inputPath);

      res.json({ 
        message: "Car image replaced successfully",
        imageUrl: imageUrl,
        carId: carWithImage.id
      });
    } catch (error) {
      // Clean up files on error
      await ImageService.deleteImage(inputPath);
      await ImageService.deleteImage(outputPath);
      await ImageService.deleteImage(thumbnailPath);
      console.error('Car image replace error:', error);
      return res.status(500).json({
        message: 'Car image replacement failed. Please try again later.'
      });
    }
  }));

  // Delete profile image - DELETE /api/upload/profile/:filename
  app.delete("/api/upload/profile/:filename", requireAuth, asyncRoute("delete profile image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const user = req.user;
    const storage = await getStorage();

    // Validate ownership - user can only delete their own profile image
    const currentUser = await storage.getUser(user.id);
    if (!currentUser || !currentUser.profileImage) {
      return res.status(404).json({ message: "No profile image found to delete" });
    }

    // Extract filename from current profile image URL
    const currentFilename = currentUser.profileImage.split('/').pop();
    if (currentFilename !== filename) {
      return res.status(403).json({ message: "Unauthorized: You can only delete your own profile image" });
    }

    try {
      // Delete image files
      const imagePath = path.join('public/uploads/profiles', filename);
      const deleteResult = await ImageService.deleteImageWithThumbnail(imagePath, 'profiles');

      // Update user's profile image field to null
      await storage.updateUser(user.id, { profileImage: null });

      if (deleteResult.success) {
        res.json({ message: "Profile image deleted successfully" });
      } else {
        res.json({ 
          message: "Profile image record updated, but some files may not have been found",
          errors: deleteResult.errors
        });
      }
    } catch (error) {
      console.error('Profile image delete error:', error);
      return res.status(500).json({
        message: 'Profile image deletion failed. Please try again later.'
      });
    }
  }));

  // Delete car image - DELETE /api/upload/car/:filename
  app.delete("/api/upload/car/:filename", requireAdmin, asyncRoute("delete car image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const storage = await getStorage();

    // Find car with this image filename using exact path segment matching
    const allCars = await storage.getAllCars();
    const carWithImage = allCars.find(car => {
      if (!car.image) return false;
      // Extract the last path segment from car.image and compare for strict equality
      const carImageFilename = car.image.split('/').pop();
      return carImageFilename === filename;
    });
    
    if (!carWithImage) {
      return res.status(404).json({ message: "Car with specified image not found" });
    }

    try {
      // Delete image files
      const imagePath = path.join('public/uploads/cars', filename);
      const deleteResult = await ImageService.deleteImageWithThumbnail(imagePath, 'cars');

      // Log successful car image deletion
      await logAdminAction(req, res, {
        resourceId: carWithImage.id,
        oldValue: { filename: filename, type: 'car' },
        additionalInfo: 'Car image deleted successfully'
      });

      // Update car's image field to a placeholder or null - for this implementation, we'll keep the old image URL
      // In a real-world scenario, you might want to set it to a default placeholder image
      // await storage.updateCar(carWithImage.id, { image: '/uploads/cars/default-car.jpg' });

      if (deleteResult.success) {
        res.json({ 
          message: "Car image deleted successfully",
          carId: carWithImage.id,
          note: "Car record still exists. Consider updating with a new image."
        });
      } else {
        res.json({ 
          message: "Car image deletion completed, but some files may not have been found",
          errors: deleteResult.errors,
          carId: carWithImage.id
        });
      }
    } catch (error) {
      console.error('Car image delete error:', error);
      return res.status(500).json({
        message: 'Car image deletion failed. Please try again later.'
      });
    }
  }));

  // Get user images - GET /api/upload/user/:userId/images
  app.get("/api/upload/user/:userId/images", requireAuth, asyncRoute("get user images", async (req: Request, res: Response) => {
    const { userId } = req.params;
    const currentUser = req.user;
    const storage = await getStorage();

    // Validate ownership - users can only access their own images, admins can access any
    if (currentUser.role !== "admin" && currentUser.id !== userId) {
      return res.status(403).json({ message: "Unauthorized: You can only access your own images" });
    }

    try {
      // Get user data
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Collect user's images
      const userImages = [];

      // Add profile image if exists
      if (user.profileImage) {
        const filename = user.profileImage.split('/').pop();
        userImages.push({
          type: 'profile',
          filename: filename,
          url: user.profileImage,
          thumbnailUrl: `/uploads/thumbs/thumb-${filename}`,
          uploadedAt: user.createdAt // Best approximation we have
        });
      }

      // Note: Cars don't have user ownership in the current schema,
      // so we can't reliably associate car images with specific users
      // This would require adding a userId field to the cars table

      res.json({
        userId: userId,
        totalImages: userImages.length,
        images: userImages
      });
    } catch (error) {
      console.error('Get user images error:', error);
      return res.status(500).json({
        message: 'Failed to retrieve user images. Please try again later.'
      });
    }
  }));

  // Serve uploaded images
  app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

  // Delete image (admin only)
  app.delete("/api/upload/:type/:filename", requireAdmin, asyncRoute("delete image", async (req: Request, res: Response) => {
    const { type, filename } = req.params;
    
    if (!['profiles', 'cars'].includes(type)) {
      return res.status(400).json({ message: "Invalid image type" });
    }

    const imagePath = path.join('public/uploads', type, filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {
      await ImageService.deleteImage(imagePath);
      await ImageService.deleteImage(thumbnailPath);
      
      res.json({ message: "Image deleted successfully" });
    } catch (error) {
      console.warn("Error deleting image:", error);
      res.json({ message: "Image deletion completed (some files may not have existed)" });
    }
  }));

  // New CRUD endpoints

  // Delete appointment (auth + ownership or admin)
  app.delete("/api/appointments/:id", requireAuth, asyncRoute("delete appointment", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    // Check if appointment exists
    const appointment = await storage.getAppointment(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check ownership (user can delete their own appointments, or admin can delete any)
    if (user.role !== "admin") {
      const customer = await storage.getCustomer(appointment.customerId);
      if (!customer || customer.userId !== user.id) {
        return res.status(403).json({ 
          message: "Unauthorized: You can only delete your own appointments" 
        });
      }
    }

    const success = await storage.deleteAppointment(id);
    if (!success) {
      return res.status(500).json({ message: "Failed to delete appointment" });
    }

    // Log admin action if user is admin
    if (user.role === "admin") {
      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: captureEntitySnapshot(appointment),
        additionalInfo: 'Appointment deleted successfully'
      });
    }

    res.status(204).send();
  }));

  // Update car (admin only since no ownership model)
  app.put("/api/cars/:id", requireAdmin, asyncRoute("update car", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();

    // Check if car exists using cached variant
    const carResult = await getCachedCar(id);
    if (!carResult.success || !carResult.data) {
      return res.status(404).json({ message: "Car not found" });
    }
    const existingCar = carResult.data;

    // Validate update data (insertCarSchema already excludes id and createdAt)
    const validatedData = insertCarSchema.partial().parse(req.body);
    const updatedCar = await storage.updateCar(id, validatedData);

    if (!updatedCar) {
      return res.status(500).json({ message: "Failed to update car" });
    }

    // Log successful car update
    await logAdminAction(req, res, {
      resourceId: id,
      oldValue: captureEntitySnapshot(existingCar),
      newValue: captureEntitySnapshot(updatedCar),
      additionalInfo: 'Car updated successfully'
    });

    // Invalidate car caches after successful update
    cacheManager.invalidateCarCaches(id);

    res.json(updatedCar);
  }));

  // Delete car (admin only since no ownership model)
  app.delete("/api/cars/:id", requireAdmin, asyncRoute("delete car", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();

    // Check if car exists using cached variant
    const carResult = await getCachedCar(id);
    if (!carResult.success || !carResult.data) {
      return res.status(404).json({ message: "Car not found" });
    }
    const existingCar = carResult.data;

    // Check if car has active bids (prevent deletion of cars with active auctions)
    const hasActiveBids = await storage.hasActiveBids(id);
    if (hasActiveBids) {
      return res.status(409).json({ 
        message: "Cannot delete car with active auction bids. Please wait for the auction to end or cancel the auction first." 
      });
    }

    // Use proper transaction-based approach to ensure atomicity
    // Either both database deletion and file cleanup succeed, or both fail
    try {
      // Step 1: Delete from database first (reversible operation)
      const dbDeleteSuccess = await storage.deleteCar(id);
      if (!dbDeleteSuccess) {
        return res.status(500).json({ message: "Failed to delete car from database" });
      }

      // Step 2: Clean up associated images after successful database deletion
      if (existingCar.image) {
        const imageCleanupResult = await ImageService.deleteImagesForCar(id, existingCar.image);
        if (!imageCleanupResult.success) {
          console.error(`Image cleanup failed after car deletion for car ${id}:`, imageCleanupResult.errors);
          // Since DB deletion succeeded but image cleanup failed, log this for manual cleanup
          // This is acceptable because orphaned files are less critical than orphaned DB references
          console.warn(`Car ${id} deleted from database but images may remain. Manual cleanup may be required.`);
        } else {
          console.log(`Successfully cleaned up images for car ${id}`);
        }
      }

      // Log successful car deletion
      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: captureEntitySnapshot(existingCar),
        additionalInfo: 'Car deleted successfully'
      });

      // Invalidate car caches after successful deletion
      cacheManager.invalidateCarCaches(id);

      res.status(204).send();
    } catch (error) {
      // If any step fails, the error will be caught by the asyncRoute wrapper
      // and handled consistently with other route errors
      throw error;
    }
  }));

  // Get customer by ID (auth + ownership or admin)
  app.get("/api/customers/:id", requireAuth, asyncRoute("get customer by ID", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    const customer = await storage.getCustomer(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Check ownership (user can access their own customer record, or admin can access any)
    if (user.role !== "admin" && customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only access your own customer information" 
      });
    }

    res.json(customer);
  }));

  // Update customer (auth + ownership)
  app.put("/api/customers/:id", requireAuth, asyncRoute("update customer", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    // Check if customer exists
    const existingCustomer = await storage.getCustomer(id);
    if (!existingCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Check ownership (user can only update their own customer record)
    if (existingCustomer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only update your own customer information" 
      });
    }

    // Validate update data with field whitelisting (prevent userId changes, id/createdAt already excluded by schema)
    const validatedData = insertCustomerSchema.omit({ userId: true }).partial().parse(req.body);

    const updatedCustomer = await storage.updateCustomer(id, validatedData);

    if (!updatedCustomer) {
      return res.status(500).json({ message: "Failed to update customer" });
    }

    res.json(updatedCustomer);
  }));

  // Test endpoint to verify database connection
  app.get("/api/health", async (req, res) => {
    try {
      // Try to fetch services to test storage connection
      const storage = await getStorage();
      await storage.getAllServices();
      res.json({ status: "ok", message: "Storage connected successfully" });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Storage connection failed" });
    }
  });

  // WhatsApp webhook endpoint for delivery status tracking
  app.post("/api/webhooks/whatsapp", async (req: Request, res: Response) => {
    try {
      const signature = req.get('X-Twilio-Signature');
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      // Always verify webhook signature when auth token is available for security
      if (process.env.TWILIO_AUTH_TOKEN) {
        if (!signature) {
          console.error('[WhatsApp Webhook] Missing signature header');
          return res.status(403).json({ message: 'Webhook signature required' });
        }
        
        // Create the payload string that Twilio signed (URL + sorted form parameters)
        // For JSON webhooks, we need to reconstruct the raw body as received
        const rawBody = JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
          .update(url + rawBody)
          .digest('base64');
        
        const providedSignature = signature.replace('sha1=', '');
        
        // Use crypto.timingSafeEqual to prevent timing attacks
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');
        const providedBuffer = Buffer.from(providedSignature, 'base64');
        
        if (expectedBuffer.length !== providedBuffer.length || 
            !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
          console.error('[WhatsApp Webhook] Invalid signature verification failed');
          console.error(`[WhatsApp Webhook] Expected: sha1=${expectedSignature}`);
          console.error(`[WhatsApp Webhook] Received: ${signature}`);
          console.error(`[WhatsApp Webhook] URL: ${url}`);
          console.error(`[WhatsApp Webhook] Body: ${rawBody}`);
          return res.status(403).json({ message: 'Invalid webhook signature' });
        }
        
        console.log('[WhatsApp Webhook] Signature verification passed');
      } else {
        console.warn('[WhatsApp Webhook] TWILIO_AUTH_TOKEN not configured - skipping signature verification');
      }
      
      const { MessageSid, MessageStatus, From, To, ErrorCode, ErrorMessage } = req.body;
      
      if (!MessageSid || !MessageStatus) {
        console.error('[WhatsApp Webhook] Missing required fields:', { MessageSid, MessageStatus });
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      console.log(`[WhatsApp Webhook] Status update: ${MessageSid} -> ${MessageStatus}`);
      
      // Update message status in database
      const storage = await getStorage();
      const updated = await storage.updateWhatsAppMessageStatus(MessageSid, {
        status: MessageStatus.toLowerCase(),
        providerResponse: JSON.stringify({
          status: MessageStatus,
          from: From,
          to: To,
          errorCode: ErrorCode,
          errorMessage: ErrorMessage,
          updatedAt: new Date().toISOString()
        })
      });
      
      if (updated) {
        console.log(`[WhatsApp Webhook] Updated message ${MessageSid} status to ${MessageStatus}`);
        // Twilio expects 200 response for successful processing
        res.status(200).send('OK');
      } else {
        console.warn(`[WhatsApp Webhook] Message ${MessageSid} not found in database`);
        // Still return 200 for missing messages to avoid Twilio retries
        // This is expected for messages sent outside our system
        res.status(200).send('Message not found');
      }
      
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      console.error('[WhatsApp Webhook] Error processing webhook:', {
        error: err.message,
        stack: err.stack,
        body: req.body,
        timestamp: new Date().toISOString()
      });
      
      // Enhanced error categorization for better monitoring
      const isTransientError = err.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
      const isDatabaseError = err.code && err.code.startsWith('2'); // PostgreSQL error codes start with 2
      
      if (isTransientError) {
        console.warn(`[WhatsApp Webhook] Transient error detected: ${err.code} - returning 503 for retry`);
        // Return 503 for transient errors to allow Twilio retries
        return res.status(503).json({ 
          message: 'Service temporarily unavailable', 
          retryAfter: 60 // Suggest retry after 60 seconds
        });
      }
      
      if (isDatabaseError) {
        console.error(`[WhatsApp Webhook] Database error: ${err.code} - ${err.message}`);
        // Database errors might be transient (connection issues) or permanent (constraint violations)
        // For webhook processing, err on the side of caution and allow retries
        return res.status(503).json({ 
          message: 'Database temporarily unavailable',
          retryAfter: 120 // Suggest retry after 2 minutes for DB issues
        });
      }
      
      // For all other application errors, return 200 to prevent Twilio retries
      // These are likely permanent issues that won't be resolved by retrying
      console.log(`[WhatsApp Webhook] Returning 200 for application error to prevent retries`);
      res.status(200).send('Error logged - no retry needed');
    }
  });
  
  // WhatsApp admin endpoints for message management
  app.get("/api/admin/whatsapp/messages", requireAdmin, asyncRoute("get whatsapp messages", async (req: Request, res: Response) => {
    const storage = await getStorage();
    const { page = 1, limit = 50, status } = req.query;
    
    try {
      const messages = await storage.getWhatsAppMessages({
        page: parseInt(page),
        limit: parseInt(limit),
        status
      });
      
      res.json(messages);
    } catch (error) {
      handleApiError(error, "fetch WhatsApp messages", res);
    }
  }));
  
  // WhatsApp message retry endpoint for failed messages
  app.post("/api/admin/whatsapp/retry/:id", requireAdmin, asyncRoute("retry whatsapp message", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();
    
    try {
      const message = await storage.getWhatsAppMessage(id);
      if (!message) {
        return res.status(404).json({ message: "WhatsApp message not found" });
      }
      
      if (message.status !== 'failed') {
        return res.status(400).json({ 
          message: "Only failed messages can be retried",
          currentStatus: message.status 
        });
      }
      
      // Retry sending the message
      // Format the phone number for WhatsApp
      const whatsappNumber = `whatsapp:+${(message.countryCode || '+91').replace(/\D/g, '')}${message.phone}`;
      const result = await WhatsAppService.sendMessage(
        whatsappNumber,
        message.content,
        message.messageType as any,
        message.appointmentId || undefined
      );
      
      if (result.success && result.messageSid) {
        await storage.updateWhatsAppMessage(id, {
          status: 'sent',
          providerResponse: result.messageSid
        });
        
        res.json({ 
          message: "Message retried successfully",
          messageSid: result.messageSid 
        });
      } else {
        res.status(500).json({ 
          message: "Failed to retry message",
          error: result.error 
        });
      }
    } catch (error) {
      handleApiError(error, "retry WhatsApp message", res);
    }
  }));

  // Contact admin endpoints for contact form management
  app.get("/api/admin/contacts", 
    createEnhancedAdminMiddleware({
      action: "read", 
      resource: "contact",
      rateLimit: 100, // Higher limit for read operations
      validateInput: (req) => {
        const { page, limit, status } = req.query;
        
        if (page && (isNaN(Number(page)) || Number(page) < 1)) {
          return "Page must be a positive number";
        }
        if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
          return "Limit must be between 1 and 100";
        }
        if (status && !["new", "responded", "resolved"].includes(status as string)) {
          return "Status must be one of: new, responded, resolved";
        }
        return null;
      }
    }),
    asyncRoute("get admin contacts", withStorage(async (storage, req: Request, res: Response) => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;

      const result = await storage.getContactsWithFilter({ page, limit, status });
      
      // Log admin action
      await logAdminAction(req, res, {
        additionalInfo: `Viewed contacts page ${page}, limit ${limit}, status: ${status || 'all'}`
      });

      res.json({
        contacts: result.contacts,
        pagination: {
          page,
          limit,
          total: result.total,
          hasMore: result.hasMore,
          totalPages: Math.ceil(result.total / limit)
        }
      });
    }))
  );

  app.patch("/api/admin/contacts/:id", 
    createEnhancedAdminMiddleware({
      action: "status_update",
      resource: "contact", 
      rateLimit: 50, // Moderate limit for status updates
      validateInput: (req) => {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!id || typeof id !== 'string') {
          return "Contact ID is required and must be a string";
        }
        if (!status || typeof status !== 'string') {
          return "Status is required and must be a string";
        }
        if (!["new", "responded", "resolved"].includes(status)) {
          return "Status must be one of: new, responded, resolved";
        }
        return null;
      }
    }),
    asyncRoute("update contact status", withStorage(async (storage, req: Request, res: Response) => {
      const { id } = req.params;
      
      // Validate request body using Zod schema
      const validatedData = updateContactSchema.parse(req.body);
      
      // Get the existing contact for audit logging
      const existingContacts = await storage.getAllContacts();
      const existingContact = existingContacts.find(c => c.id === id);
      
      if (!existingContact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      // Update the contact status
      const updatedContact = await storage.updateContact(id, validatedData);
      
      if (!updatedContact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      // Log admin action with old and new values
      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: { status: existingContact.status },
        newValue: { status: updatedContact.status },
        additionalInfo: `Contact status changed from ${existingContact.status} to ${updatedContact.status}`
      });

      res.json({
        message: "Contact status updated successfully",
        contact: updatedContact
      });
    }))
  );

  // Admin audit log endpoints for viewing administrative actions
  app.get("/api/admin/audit-logs", 
    createEnhancedAdminMiddleware({
      action: "read", 
      resource: "audit_log",
      rateLimit: 100, // Higher limit for read operations
      validateInput: (req) => {
        const { adminUserId, limit, offset } = req.query;
        
        if (adminUserId && typeof adminUserId !== 'string') {
          return "Admin user ID must be a string";
        }
        if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
          return "Limit must be between 1 and 100";
        }
        if (offset && (isNaN(Number(offset)) || Number(offset) < 0)) {
          return "Offset must be a non-negative number";
        }
        return null;
      }
    }),
    asyncRoute("get admin audit logs", withStorage(async (storage, req: Request, res: Response) => {
      const adminUserId = req.query.adminUserId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const auditLogs = await storage.getAdminAuditLogs(adminUserId, limit, offset);
      
      // Log admin action
      await logAdminAction(req, res, {
        additionalInfo: `Viewed audit logs - adminUserId: ${adminUserId || 'all'}, limit: ${limit}, offset: ${offset}`
      });

      res.json({
        auditLogs,
        pagination: {
          limit,
          offset,
          hasMore: auditLogs.length === limit,
          total: await storage.getAdminAuditLogsCount(adminUserId) // Precise total
        },
        filters: {
          adminUserId: adminUserId || null
        }
      });
    }))
  );

  app.get("/api/admin/audit-logs/resource/:resource/:resourceId", 
    createEnhancedAdminMiddleware({
      action: "read", 
      resource: "audit_log",
      rateLimit: 100, // Higher limit for read operations
      validateInput: (req) => {
        const { resource, resourceId } = req.params;
        const { limit } = req.query;
        
        if (!resource || typeof resource !== 'string') {
          return "Resource type is required and must be a string";
        }
        if (!resourceId || typeof resourceId !== 'string') {
          return "Resource ID is required and must be a string";
        }
        if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
          return "Limit must be between 1 and 100";
        }
        
        // Validate resource type against known types
        const validResources = ["user", "service", "appointment", "location", "car", "contact"];
        if (!validResources.includes(resource)) {
          return `Resource type must be one of: ${validResources.join(", ")}`;
        }
        
        return null;
      }
    }),
    asyncRoute("get resource audit logs", withStorage(async (storage, req: Request, res: Response) => {
      const { resource, resourceId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const auditLogs = await storage.getResourceAuditLogs(resource, resourceId, limit);
      
      // Log admin action
      await logAdminAction(req, res, {
        additionalInfo: `Viewed audit logs for ${resource} ${resourceId}, limit: ${limit}`
      });

      res.json({
        auditLogs,
        resource,
        resourceId,
        pagination: {
          limit,
          hasMore: auditLogs.length === limit
        }
      });
    }))
  );

  // Media Library Admin API - Upload branding and site images
  app.post("/api/admin/media-library/upload",
    createEnhancedAdminMiddleware({
      action: "create",
      resource: "media_library",
      rateLimit: 20
    }),
    profileUpload.single('image'),
    asyncRoute("upload media library image", async (req: Request, res: Response) => {
      if (!req.file) {
        return sendValidationError(res, "No image file uploaded", []);
      }

      const { imageType, altText, caption, tags, isActive } = req.body;
      
      // Validate imageType
      const validImageTypes = ['logo', 'banner', 'icon', 'gallery', 'service', 'testimonial', 'general'];
      if (!imageType || !validImageTypes.includes(imageType)) {
        return sendValidationError(res, `Image type must be one of: ${validImageTypes.join(', ')}`, []);
      }

      try {
        const storage = await getStorage();
        const uploadedBy = req.user!.id;
        
        // Validate image
        const isValid = await ImageService.validateImage(req.file.path);
        if (!isValid) {
          await fs.unlink(req.file.path);
          return sendValidationError(res, "Invalid image file or dimensions", []);
        }

        // Process image
        const ext = path.extname(req.file.filename).toLowerCase();
        let fileUrl = `/uploads/profiles/${req.file.filename}`;
        let width, height;
        
        if (ext !== '.svg') {
          const metadata = await sharp(req.file.path).metadata();
          width = metadata.width;
          height = metadata.height;
        }

        // Create media library record
        const mediaImage = await storage.createMediaLibraryImage({
          fileName: req.file.filename,
          fileUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          imageType,
          altText: altText || null,
          caption: caption || null,
          width: width || null,
          height: height || null,
          uploadedBy,
          tags: tags || null,
          isActive: isActive === 'true' || isActive === true || isActive === undefined
        });

        await logAdminAction(req, res, {
          resourceId: mediaImage.id,
          additionalInfo: JSON.stringify({
            action: "upload_media_library_image",
            imageType,
            fileName: req.file.filename,
            fileSize: req.file.size
          })
        });

        return sendResourceCreated(res, mediaImage, "Media image uploaded successfully");
      } catch (error) {
        if (req.file) {
          await fs.unlink(req.file.path).catch(err => console.error('Failed to delete file:', err));
        }
        handleApiError(error, "upload media library image", res);
      }
    })
  );

  // Get all media library images
  app.get("/api/admin/media-library",
    requireAdmin,
    asyncRoute("get media library images", async (req: Request, res: Response) => {
      const storage = await getStorage();
      const { imageType, uploadedBy, isActive } = req.query;
      
      const filters: any = {};
      if (imageType) filters.imageType = imageType as string;
      if (uploadedBy) filters.uploadedBy = uploadedBy as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      
      const images = await storage.getAllMediaLibraryImages(filters);
      
      return sendSuccess(res, images);
    })
  );

  const httpServer = createServer(app);

  return httpServer;
}
