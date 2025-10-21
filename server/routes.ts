import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import express from "express";
import { getStorage, type CarFilterOptions } from "./storage";
import {
  authLimiter,
  strictAuthLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  contactFormLimiter,
  appointmentCreationLimiter,
  bidPlacementLimiter,
  imageUploadLimiter,
  searchQueryLimiter,
  webhookLimiter,
  whatsappLimiter,
  publicDataLimiter
} from "./rate-limiters";
import { 
  insertServiceSchema,
  insertAppointmentSchema,
  insertCarSchema,
  insertCarImageSchema,
  insertCustomerSchema,
  insertContactSchema,
  insertLocationSchema,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  registerSchema,
  serverRegisterSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetVerifySchema,
  rescheduleAppointmentSchema,
  placeBidSchema,
  updateProfileSchema,
  updateContactSchema,
  updateUserSettingsSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminResetPasswordSchema,
  whatsappConfirmationSchema,
  whatsappStatusUpdateSchema,
  whatsappBidNotificationSchema,
  whatsappWebhookSchema,
  type User
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { hashPassword, verifyPassword, passport } from "./auth";
import { EmailNotificationService, sendEmail } from "./email-service";
import { WhatsAppService } from "./whatsapp-service";
import { NotificationService } from "./notification-service";
import { ImageService, profileUpload, carUpload, IMAGE_CONFIG } from "./image-service";
import { invoiceService } from "./invoice-service";
import { getPerformanceMetrics } from "./performance-monitor";
import { sanitizeUsername, sanitizeEmail, sanitizePhone, sanitizeMessage, sanitizeAddress, sanitizeUrl, sanitizeString } from "./sanitization";
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
import sharp from 'sharp';
import { promises as fs } from 'fs';

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

declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    oauthStateTimestamp?: number;
    createdAt?: number;
    lastIP?: string;
    lastActivity?: number;
    userAgent?: string;
    deviceFingerprint?: string;
  }
}

interface AdminContext {
  action: string;
  resource: string;
  adminUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}

declare global {
  namespace Express {
    interface Request {
      adminContext?: AdminContext;
    }
  }
}

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

interface AppError extends Error {
  status?: number;
  code?: string;
  errors?: string[];
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void | Response> | void | Response;

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

type UserUpdateData = Partial<Omit<User, 'id' | 'createdAt'>>;

type AdminValidationFunction = (req: Request) => string | null;

function handleApiError(error: unknown, operation: string, res: Response): void {

  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    const errorMessage = fromZodError(error as any).toString();
    console.error(`[VALIDATION ERROR] ${operation}:`, errorMessage);
    sendValidationError(res, "Validation failed", [errorMessage]);
    return;
  }

  if (error && typeof error === "object" && ("code" in error || "constraint" in error)) {
    sendDatabaseError(res, operation, error as DatabaseError);
    return;
  }

  if (error && typeof error === "object" && "status" in error) {
    const appError = error as AppError;
    const message = appError.message || `Failed to ${operation}`;
    const statusCode = appError.status || 500;
    const code = appError.code || undefined;
    const errors = appError.errors || undefined;
    
    sendError(res, message, statusCode, errors, code);
    return;
  }

  console.error(`Unexpected error during ${operation}:`, error);
  sendError(res, `Failed to ${operation}. Please try again later.`);
}

function asyncRoute(operation: string, handler: AsyncRouteHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleApiError(error, operation, res);
    }
  };
}

function withStorage<T extends unknown[], R>(
  handler: (storage: Awaited<ReturnType<typeof getStorage>>, ...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    try {
      const storage = await getStorage();
      return await handler(storage, ...args);
    } catch (error) {
      console.error('Storage connection error:', error);

      return Promise.reject({
        status: 500,
        message: 'Database connection failed. Please try again later.'
      });
    }
  };
}

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
      
      return { success: true, data, attempts: attempt };
    } catch (error) {
      const err = error as DatabaseError;
      lastError = err;
      const isLastAttempt = attempt === maxRetries;

      const isRetryableError = !err.code || !['23505', '23503', '23502'].includes(err.code);
      
      if (isLastAttempt || !isRetryableError) {
        console.error(`[RETRY_FAILED] ${operationName} failed on attempt ${attempt}/${maxRetries}:`, {
          error: err.message,
          code: err.code,
          retryable: isRetryableError,
          isLastAttempt
        });
        
        if (!isRetryableError) {
        }
        break;
      }

      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.1 * exponentialDelay;
      const delay = Math.min(exponentialDelay + jitter, 10000);
      
      console.warn(`[RETRY_ATTEMPT] ${operationName} failed on attempt ${attempt}/${maxRetries}, retrying in ${Math.round(delay)}ms:`, {
        error: err.message,
        code: err.code
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { success: false, error: lastError, attempts: maxRetries };
}

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

const CACHE_CONFIG = {

  short: { maxAge: 2 * 60 * 1000, preFetch: 0.6 },

  medium: { maxAge: 5 * 60 * 1000, preFetch: 0.6 },

  long: { maxAge: 10 * 60 * 1000, preFetch: 0.6 }
};

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
      code: (result.error as DatabaseError | undefined)?.code,
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
      code: (result.error as DatabaseError | undefined)?.code,
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
      code: (result.error as DatabaseError | undefined)?.code,
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
      code: (result.error as DatabaseError | undefined)?.code,
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
      code: (result.error as DatabaseError | undefined)?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.medium, promise: true });

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
      code: (result.error as DatabaseError | undefined)?.code,
      attempts: result.attempts,
      context: { serviceId: id }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

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
      code: (result.error as DatabaseError | undefined)?.code,
      attempts: result.attempts,
      context: { locationId: id }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

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
      code: (result.error as DatabaseError | undefined)?.code,
      attempts: result.attempts,
      context: { carId: id }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

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
      code: (result.error as DatabaseError | undefined)?.code,
      attempts: result.attempts,
      context: { category }
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.long, promise: true, primitive: true, max: 100 });

const getCachedBidAnalytics = memoizee(async () => {
  const result = await withRetry(async () => {
    const storage = await getStorage();
    return await storage.getBidAnalytics();
  }, 'getBidAnalytics');
  
  if (!result.success) {
    logAdminStatsError({
      operation: 'getBidAnalytics',
      timestamp: new Date().toISOString(),
      error: result.error?.message || 'Unknown error',
      code: (result.error as DatabaseError | undefined)?.code,
      attempts: result.attempts
    });
  }
  
  return result;
}, { ...CACHE_CONFIG.medium, promise: true });

class CacheManager {
  private static instance: CacheManager;
  private cacheCounters: {
    services: { bulk: number; individual: number; categories: number; };
    locations: { bulk: number; individual: number; };
    cars: { bulk: number; individual: number; };
    appointments: number;
    users: number;
    bids: number;
    hits: number;
    misses: number;
  };
  
  private constructor() {

    this.cacheCounters = {
      services: { bulk: 0, individual: 0, categories: 0 },
      locations: { bulk: 0, individual: 0 },
      cars: { bulk: 0, individual: 0 },
      appointments: 0,
      users: 0,
      bids: 0,
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

  trackCacheHit(): void {
    this.cacheCounters.hits++;
  }
  
  trackCacheMiss(): void {
    this.cacheCounters.misses++;
  }

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

  invalidateServiceCaches(serviceId?: string, prevCategory?: string, nextCategory?: string): void {
    const categories = [prevCategory, nextCategory].filter(Boolean);
    
    try {

      getCachedServices.clear();
      this.cacheCounters.services.bulk = 0;

      if (serviceId) {
        getCachedService.delete(serviceId);
        this.cacheCounters.services.individual = Math.max(0, this.cacheCounters.services.individual - 1);
      }

      if (categories.length > 0) {

        categories.forEach(category => {
          if (category) {
            getCachedServicesByCategory.delete(category);
            this.cacheCounters.services.categories = Math.max(0, this.cacheCounters.services.categories - 1);
          }
        });
        
      } else {

        getCachedServicesByCategory.clear();
        this.cacheCounters.services.categories = 0;
      }
      
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing service caches:', error);
    }
  }

  invalidateLocationCaches(locationId?: string): void {
    
    try {

      getCachedLocations.clear();
      this.cacheCounters.locations.bulk = 0;

      if (locationId) {
        getCachedLocation.delete(locationId);
        this.cacheCounters.locations.individual = Math.max(0, this.cacheCounters.locations.individual - 1);
      }
      
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing location caches:', error);
    }
  }

  invalidateCarCaches(carId?: string): void {
    
    try {

      getCachedCars.clear();
      this.cacheCounters.cars.bulk = 0;

      if (carId) {
        getCachedCar.delete(carId);
        this.cacheCounters.cars.individual = Math.max(0, this.cacheCounters.cars.individual - 1);
      }
      
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing car caches:', error);
    }
  }

  invalidateAppointmentCaches(): void {
    
    try {
      getCachedAppointments.clear();
      this.cacheCounters.appointments = 0;
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing appointment caches:', error);
    }
  }

  invalidateUserCaches(): void {
    
    try {
      getCachedUserCount.clear();
      this.cacheCounters.users = 0;
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing user caches:', error);
    }
  }

  invalidateBidCaches(): void {
    
    try {
      getCachedBidAnalytics.clear();
      this.cacheCounters.bids = 0;
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing bid caches:', error);
    }
  }

  clearAllCaches(): void {
    
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
      getCachedBidAnalytics.clear();

      this.cacheCounters = {
        services: { bulk: 0, individual: 0, categories: 0 },
        locations: { bulk: 0, individual: 0 },
        cars: { bulk: 0, individual: 0 },
        appointments: 0,
        users: 0,
        bids: 0,
        hits: 0,
        misses: 0
      };
      
    } catch (error) {
      console.error('[CACHE_INVALIDATION] Error clearing all caches:', error);
    }
  }

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

      performance: {
        totalEntries,
        hits: this.cacheCounters.hits,
        misses: this.cacheCounters.misses,
        hitRate,
        totalOperations
      },

      timestamp: new Date().toISOString()
    };
  }
}

const cacheManager = CacheManager.getInstance();

interface AdminStatsResponse {

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

  warnings?: {
    message: string;
    details: string[];
    impact: 'low' | 'medium' | 'high';
  };
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const skipRoutes = [
      '/auth/google',
      '/auth/google/callback'
    ];
    
    if (skipRoutes.some(route => req.path.startsWith(route))) {

      const userAgent = req.headers['user-agent'];
      const origin = req.headers.origin;
      const referer = req.headers.referer;

      if (!userAgent || userAgent.length < 10) {
        console.warn(`[CSRF] Suspicious OAuth request - invalid/missing user agent for ${req.path}`);
      }

      if (req.path === '/auth/google/callback') {

        if (referer && !referer.includes('google') && !referer.includes('accounts.google.com')) {
          console.warn(`[CSRF] OAuth callback from unexpected referer: ${referer}`);
        }
      }
      
      return next();
    }

    if (['/auth/login', '/auth/register'].includes(req.path)) {
      const origin = req.headers.origin;
      const referer = req.headers.referer;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host');
      const expectedOrigin = `${protocol}://${host}`;
      
      if (!origin && !referer) {
        console.error(`[CSRF] REJECTED: Missing origin/referer for ${req.path}`);
        return sendForbiddenError(res, "CSRF protection: Missing origin/referer header");
      }
      
      if (origin && origin !== expectedOrigin) {
        console.error(`[CSRF] REJECTED: Invalid origin ${origin} (expected ${expectedOrigin}) for ${req.path}`);
        return sendForbiddenError(res, "CSRF protection: Invalid origin");
      }
      
      if (referer && !referer.startsWith(expectedOrigin)) {
        console.error(`[CSRF] REJECTED: Invalid referer ${referer} (expected to start with ${expectedOrigin}) for ${req.path}`);
        return sendForbiddenError(res, "CSRF protection: Invalid referer");
      }
      
      return next();
    }

    const customHeader = req.headers['x-csrf-protection'];
    const expectedToken = process.env.CSRF_TOKEN || 'ronak-garage';
    
    if (!customHeader || customHeader !== expectedToken) {
      console.error(`[CSRF] REJECTED: Missing/invalid security header for ${req.path}`);
      return sendForbiddenError(res, "CSRF protection: Missing or invalid security header");
    }
    
    next();
  };

  app.use('/api', csrfProtection);

  app.post("/api/auth/register", authLimiter, asyncRoute("register user", async (req: Request, res: Response) => {

    const validationResult = serverRegisterSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
      return;
    }

    const { email, name, password } = validationResult.data;
    
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedName = sanitizeUsername(name);
    
    if (!sanitizedEmail) {
      sendValidationError(res, "Invalid email address", []);
      return;
    }
    
    if (!sanitizedName) {
      sendValidationError(res, "Invalid name", []);
      return;
    }
    
    const storage = await getStorage();

    const existingUser = await storage.getUserByEmail(sanitizedEmail);
    if (existingUser) {
      sendConflictError(res, "An account with this email address already exists. Please try logging in instead, or use a different email address.");
      return;
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await storage.createUser({
      email: sanitizedEmail,
      name: sanitizedName,
      password: hashedPassword,
      provider: "email",
      emailVerified: false,
      role: "customer"
    });

    const { token } = await storage.createVerificationToken(newUser.id, sanitizedEmail);

    const emailSent = await EmailNotificationService.sendVerificationEmail(sanitizedEmail, token, sanitizedName);
    
    if (!emailSent) {
      console.error(`[REGISTER] Failed to send verification email to ${email}`);
    }

    sendResourceCreated(res, 
      { message: "Registration successful! We've sent a verification link to your email. Please check your inbox (and spam folder) to verify your account." },
      "User registered successfully"
    );
  }));

  app.post("/api/auth/login", strictAuthLimiter, asyncRoute("login user", async (req: Request, res: Response) => {

    const validationResult = loginSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
      return;
    }

    const { email, password } = validationResult.data;
    const storage = await getStorage();

    const user = await storage.getUserByEmail(email);
    
    if (!user || !user.password) {
      sendUnauthorizedError(res, "We couldn't find an account with that email and password combination. Please check your credentials and try again.");
      return;
    }

    const isDevelopment = process.env.NODE_ENV !== 'production';
    const sendGridConfigured = process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL;
    
    if (!user.emailVerified) {

      const allowUnverifiedLogin = process.env.ALLOW_UNVERIFIED_LOGIN === 'true';
      
      if (allowUnverifiedLogin && isDevelopment) {
        console.warn(`[LOGIN] SECURITY WARNING: Allowing unverified user login due to ALLOW_UNVERIFIED_LOGIN=true: ${user.email}`);
      } else {
        sendForbiddenError(res, "Please verify your email address before logging in. Check your inbox (and spam folder) for the verification link. Didn't receive it? Request a new one from the login page.");
        return;
      }
    }

    const passwordValid = await verifyPassword(password, user.password);
    
    if (!passwordValid) {
      sendUnauthorizedError(res, "The password you entered is incorrect. Please try again or use 'Forgot Password' to reset it.");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    initializeSessionSecurity(req);

    const { password: _, ...userResponse } = user;
    sendSuccess(res, userResponse, "Login successful");
  }));

  app.post("/api/auth/logout", asyncRoute("logout", async (req: Request, res: Response) => {
    req.logout((err: Error | null) => {
      if (err) {
        throw { status: 500, message: "Logout failed" };
      }
      
      req.session.destroy((destroyErr: Error | null) => {
        if (destroyErr) {
          console.error('[LOGOUT] Session destruction error:', destroyErr);
        }
        return sendSuccess(res, null, "Logout successful");
      });
    });
  }));

  app.post("/api/auth/verify-email", emailVerificationLimiter, asyncRoute("verify email", async (req: Request, res: Response) => {
    const { token, email } = req.body;

    if (!token || !email) {
      sendValidationError(res, "Invalid verification link. Please use the link from your email or request a new one.", []);
      return;
    }

    const storage = await getStorage();
    const crypto = await import('crypto');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const verificationToken = await storage.getVerificationToken(tokenHash, email);
    
    if (!verificationToken) {
      sendError(res, "This verification link is invalid or has expired. Please request a new verification email to complete your registration.", 400, undefined, "INVALID_TOKEN");
      return;
    }

    const success = await storage.consumeVerificationToken(tokenHash, 'email_verification');
    
    if (!success) {
      sendError(res, "Failed to verify email. Please try again.", 500);
      return;
    }

    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      sendNotFoundError(res, "User");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    initializeSessionSecurity(req);

    const { password: _, ...userResponse } = user;
    sendSuccess(res, userResponse, "Email verified successfully! You are now logged in.");
  }));

  app.post("/api/auth/resend-verification", emailVerificationLimiter, asyncRoute("resend verification email", async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      sendValidationError(res, "Please provide your email address to resend the verification link", []);
      return;
    }

    const storage = await getStorage();

    const user = await storage.getUserByEmail(email);
    
    if (!user) {

      sendSuccess(res, null, "If an unverified account exists with this email, a verification link has been sent.");
      return;
    }

    if (user.emailVerified) {
      sendError(res, "This email is already verified. You can log in.", 400, undefined, "ALREADY_VERIFIED");
      return;
    }

    const activeToken = await storage.getActiveVerificationToken(user.id);
    
    if (activeToken && activeToken.resendCount >= 3) {
      sendError(res, "You've reached the maximum number of verification email requests. Please wait an hour before trying again or contact support if you need help.", 429, undefined, "RATE_LIMIT_EXCEEDED");
      return;
    }

    const { token } = await storage.createVerificationToken(user.id, email);

    if (activeToken) {
      await storage.incrementResendCount(user.id);
    }

    const emailSent = await EmailNotificationService.sendVerificationEmail(email, token, user.name);
    
    if (!emailSent) {
      console.error(`[RESEND_VERIFICATION] Failed to send verification email to ${email}`);
      sendError(res, "We couldn't send the verification email right now. Please try again in a few minutes or contact support if the problem persists.", 500);
      return;
    }

    sendSuccess(res, null, "Verification email sent! Please check your inbox and spam folder for the verification link.");
  }));

  app.post("/api/auth/password-reset/request", passwordResetLimiter, asyncRoute("request password reset", async (req: Request, res: Response) => {
    const validationResult = passwordResetRequestSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
      return;
    }

    const { email } = validationResult.data;
    const storage = await getStorage();

    const GENERIC_RESPONSE = "If an account exists with this email, you will receive a password reset link shortly.";

    const startTime = Date.now();

    const user = await storage.getUserByEmail(email);
    
    if (!user) {

      const minDelay = 100;
      const elapsed = Date.now() - startTime;
      if (elapsed < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
      }
      
      sendSuccess(res, null, GENERIC_RESPONSE);
      return;
    }

    if (!user.password) {

      const minDelay = 100;
      const elapsed = Date.now() - startTime;
      if (elapsed < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
      }

      sendSuccess(res, null, GENERIC_RESPONSE);
      return;
    }

    try {

      const { token } = await storage.createVerificationToken(user.id, email, 'password_reset');

      const emailSent = await EmailNotificationService.sendPasswordResetEmail(email, token, user.name);
      
      if (!emailSent) {

        console.error(`[PASSWORD_RESET] Failed to send password reset email to ${email} (User ID: ${user.id})`);
      } else {
      }
    } catch (error) {

      console.error(`[PASSWORD_RESET] Error during password reset process for ${email}:`, error);
    }

    sendSuccess(res, null, GENERIC_RESPONSE);
  }));

  app.post("/api/auth/password-reset/verify", passwordResetLimiter, asyncRoute("verify password reset", async (req: Request, res: Response) => {
    const validationResult = passwordResetVerifySchema.safeParse(req.body);
    
    if (!validationResult.success) {
      sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
      return;
    }

    const { token, email, newPassword } = validationResult.data;
    const storage = await getStorage();
    const crypto = await import('crypto');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const verificationToken = await storage.getVerificationToken(tokenHash, email, 'password_reset');
    
    if (!verificationToken) {
      sendError(res, "Invalid or expired reset link. Please request a new password reset.", 400, undefined, "INVALID_TOKEN");
      return;
    }

    const user = await storage.getUser(verificationToken.userId);
    
    if (!user) {
      sendNotFoundError(res, "User");
      return;
    }

    const hashedPassword = await hashPassword(newPassword);

    await storage.updateUser(user.id, { password: hashedPassword });

    await storage.consumeVerificationToken(tokenHash, 'password_reset');
    
    sendSuccess(res, null, "Password has been reset successfully. You can now log in with your new password.");
  }));

  app.get("/api/auth/google", asyncRoute("Google OAuth initiation", async (req: Request, res: Response, next: NextFunction) => {

    const state = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();

    req.session.oauthState = state;
    req.session.oauthStateTimestamp = timestamp;
    
    req.session.save((err) => {
      if (err) {
        console.error('[OAUTH_SECURITY] Failed to save OAuth state to session:', err);
        sendError(res, "Failed to initiate OAuth. Please try again.", 500);
        return;
      }

      passport.authenticate("google", { 
        scope: ["profile", "email"],
        prompt: "select_account",
        state: state
      })(req, res, next);
    });
  }));

  app.get("/api/auth/google/callback", asyncRoute("Google OAuth callback validation", async (req: Request, res: Response, next: NextFunction) => {
    const receivedState = req.query.state as string;
    const storedState = req.session.oauthState;
    const stateTimestamp = req.session.oauthStateTimestamp;

    if (!receivedState || !storedState) {
      console.error('[OAUTH_SECURITY] OAuth state validation failed - missing state', {
        hasReceivedState: !!receivedState,
        hasStoredState: !!storedState,
        sessionID: req.sessionID,
        ip: req.ip
      });

      delete req.session.oauthState;
      delete req.session.oauthStateTimestamp;
      
      res.redirect("/login?error=oauth_security_failed");
      return;
    }

    if (receivedState !== storedState) {
      console.error('[OAUTH_SECURITY] OAuth state validation failed - state mismatch', {
        sessionID: req.sessionID,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      delete req.session.oauthState;
      delete req.session.oauthStateTimestamp;
      
      res.redirect("/login?error=oauth_security_failed");
      return;
    }

    const STATE_EXPIRY_MS = 5 * 60 * 1000;
    const now = Date.now();
    
    if (!stateTimestamp || (now - stateTimestamp) > STATE_EXPIRY_MS) {
      console.error('[OAUTH_SECURITY] OAuth state validation failed - expired state', {
        stateAge: stateTimestamp ? now - stateTimestamp : 'unknown',
        expiryLimit: STATE_EXPIRY_MS,
        sessionID: req.sessionID,
        ip: req.ip
      });

      delete req.session.oauthState;
      delete req.session.oauthStateTimestamp;
      
      res.redirect("/login?error=oauth_expired");
      return;
    }
    
    delete req.session.oauthState;
    delete req.session.oauthStateTimestamp;

    passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed" }, (err: any, user: Express.User | false) => {
      if (err) {
        console.error('[OAUTH_SECURITY] Passport authentication error:', err);
        return res.redirect("/login?error=oauth_failed");
      }
      
      if (!user) {
        console.error('[OAUTH_SECURITY] No user returned from OAuth');
        return res.redirect("/login?error=oauth_failed");
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('[OAUTH_SECURITY] Login error after OAuth:', loginErr);
          return res.redirect("/login?error=oauth_failed");
        }

        initializeSessionSecurity(req);
        
        res.redirect("/?auth=success");
      });
    })(req, res, next);
  }));

  app.get("/api/auth/me", asyncRoute("get current user", async (req: Request, res: Response) => {
    if (req.user) {
      const { password, ...userResponse } = req.user as any;
      sendSuccess(res, userResponse);
    } else {
      throw { status: 401, message: "Not authenticated" };
    }
  }));

  app.get("/api/auth/providers", asyncRoute("get auth providers", async (req: Request, res: Response) => {
    const providers = ["email"];

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push("google");
    }
    
    sendSuccess(res, { providers });
  }));

  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {

    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required",
        code: "AUTH_REQUIRED" 
      });
    }

    try {
      const storage = await getStorage();
      const dbUser = await storage.getUser(req.user.id);
      
      if (!dbUser) {
        console.warn(`[SECURITY] User ${req.user.id} not found in database during request`);
        return res.status(401).json({ 
          message: "User account not found. Please login again.",
          code: "USER_NOT_FOUND" 
        });
      }
      
      if (!dbUser.isActive) {
        return res.status(403).json({ 
          message: "Your account has been suspended. Please contact support.",
          code: "ACCOUNT_SUSPENDED" 
        });
      }
      
      req.user = dbUser;
    } catch (error) {
      console.error('[SECURITY] Database verification error:', error);
      return res.status(500).json({ 
        message: "Security verification failed",
        code: "VERIFICATION_ERROR" 
      });
    }

    const sessionValidation = validateSessionSecurity(req);
    if (!sessionValidation.valid) {
      const errorMessages: Record<string, string> = {
        'INVALID_SESSION': 'Invalid session. Please login again.',
        'SESSION_EXPIRED': 'Session expired. Please login again.',
        'DEVICE_MISMATCH': 'Session security violation detected. Please login again.'
      };
      
      return res.status(401).json({ 
        message: errorMessages[sessionValidation.reason!] || 'Session validation failed',
        code: sessionValidation.reason 
      });
    }

    next();
  };

  app.get("/api/metrics", requireAuth, asyncRoute("get performance metrics", async (req, res) => {
    const metrics = getPerformanceMetrics();
    sendSuccess(res, {
      ...metrics,
      monitoringUptimeMs: Date.now() - metrics.monitoringSince,
      timestamp: new Date().toISOString()
    });
  }));

  app.get("/api/profile", requireAuth, asyncRoute("get user profile", async (req: Request, res: Response) => {
    const { password, ...userProfile } = req.user!;
    res.json({ user: userProfile });
  }));

  app.patch("/api/profile", requireAuth, asyncRoute("update user profile", async (req: Request, res: Response) => {
    const validationResult = updateProfileSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
    }

    const updateData = { ...validationResult.data } as UserUpdateData;

    if (updateData.name) {
      updateData.name = sanitizeUsername(updateData.name);
    }
    
    if (updateData.email) {
      updateData.email = sanitizeEmail(updateData.email);
    }
    
    if (updateData.phone) {
      updateData.phone = sanitizePhone(updateData.phone);
    }
    
    if (updateData.countryCode) {
      updateData.countryCode = sanitizeString(updateData.countryCode);
    }
    
    if (updateData.address) {
      updateData.address = sanitizeAddress(updateData.address);
    }
    
    if (updateData.city) {
      updateData.city = sanitizeString(updateData.city);
    }
    
    if (updateData.state) {
      updateData.state = sanitizeString(updateData.state);
    }
    
    if (updateData.zipCode) {
      updateData.zipCode = sanitizeString(updateData.zipCode);
    }
    
    if (updateData.registrationNumbers) {
      updateData.registrationNumbers = updateData.registrationNumbers.map(value => sanitizeString(value));
    }
    
    const storage = await getStorage();

    if (updateData.dateOfBirth) {
      (updateData as any).dateOfBirth = new Date(updateData.dateOfBirth);
    }

    const updatedUser = await storage.updateUser(req.user!.id, updateData);
    const { password, ...userResponse } = updatedUser!;
    
    sendResourceUpdated(res, { user: userResponse }, "Profile updated successfully");
  }));

  app.get("/api/user/settings", requireAuth, asyncRoute("get user settings", async (req: Request, res: Response) => {
    const { preferredNotificationChannel } = req.user!;
    sendSuccess(res, { 
      preferredNotificationChannel: preferredNotificationChannel || 'whatsapp' 
    });
  }));

  app.put("/api/user/settings", requireAuth, asyncRoute("update user settings", async (req: Request, res: Response) => {
    const validationResult = updateUserSettingsSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      sendValidationError(res, "Validation failed", [fromZodError(validationResult.error).toString()]);
      return;
    }

    const storage = await getStorage();
    const updatedUser = await storage.updateUser(req.user!.id, {
      preferredNotificationChannel: validationResult.data.preferredNotificationChannel
    });
    
    const { password, ...userResponse } = updatedUser!;
    sendResourceUpdated(res, { 
      preferredNotificationChannel: userResponse.preferredNotificationChannel 
    }, "Notification preferences updated successfully");
  }));

  app.post("/api/whatsapp/send-confirmation", whatsappLimiter, requireAuth, asyncRoute("send WhatsApp confirmation", async (req: Request, res: Response) => {

    const validationResult = whatsappConfirmationSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      throw {
        name: "ZodError",
        errors: validationResult.error.errors
      };
    }

    const { phone, countryCode, appointmentData, appointmentId } = validationResult.data;

    const sanitizedPhone = sanitizePhone(phone);
    const sanitizedCountryCode = sanitizeString(countryCode);

    const validation = WhatsAppService.validateWhatsAppNumber(sanitizedPhone, sanitizedCountryCode);
    if (!validation.valid) {
      throw { status: 400, message: validation.message };
    }

    const transformedAppointmentData = {
      customerName: appointmentData.customerName,
      serviceName: appointmentData.serviceName,
      dateTime: appointmentData.dateTime,
      location: appointmentData.locationName,
      carDetails: 'Vehicle details not provided',
      bookingId: appointmentId || 'TEMP-' + Date.now().toString(),
      mechanicName: appointmentData.mechanicName,
      price: appointmentData.price
    };

    const result = await WhatsAppService.sendAppointmentConfirmation(
      sanitizedPhone, 
      sanitizedCountryCode, 
      transformedAppointmentData,
      appointmentId
    );
    
    if (result.success) {
      sendSuccess(res, { messageSid: result.messageSid }, "WhatsApp confirmation sent successfully");
    } else {
      throw { status: 500, message: result.message, error: result.error };
    }
  }));

  app.post("/api/whatsapp/send-status-update", whatsappLimiter, requireAuth, asyncRoute("send WhatsApp status update", async (req: Request, res: Response) => {
    const { phone, countryCode, statusData, appointmentId } = req.body;
    
    if (!phone || !countryCode || !statusData) {
      sendValidationError(res, "Phone number, country code, and status data are required");
      return;
    }

    const sanitizedPhone = sanitizePhone(phone);
    const sanitizedCountryCode = sanitizeString(countryCode);

    const result = await WhatsAppService.sendStatusUpdate(
      sanitizedPhone, 
      sanitizedCountryCode, 
      statusData,
      appointmentId
    );
    
    if (result.success) {
      sendSuccess(res, { messageSid: result.messageSid }, "WhatsApp status update sent successfully");
    } else {
      sendError(res, result.message, 500, undefined, "WHATSAPP_SEND_FAILED");
    }
  }));

  app.post("/api/whatsapp/send-bid-notification", whatsappLimiter, requireAuth, asyncRoute("send WhatsApp bid notification", async (req: Request, res: Response) => {
    const { phone, countryCode, bidData } = req.body;
    
    if (!phone || !countryCode || !bidData) {
      sendValidationError(res, "Phone number, country code, and bid data are required");
      return;
    }

    const sanitizedPhone = sanitizePhone(phone);
    const sanitizedCountryCode = sanitizeString(countryCode);

    const result = await WhatsAppService.sendBidNotification(
      sanitizedPhone, 
      sanitizedCountryCode, 
      bidData
    );
    
    if (result.success) {
      sendSuccess(res, { messageSid: result.messageSid }, "WhatsApp bid notification sent successfully");
    } else {
      sendError(res, result.message, 500, undefined, "WHATSAPP_SEND_FAILED");
    }
  }));

  app.get("/api/whatsapp/history/:phone", requireAuth, asyncRoute("get WhatsApp message history", async (req: Request, res: Response) => {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    
    if (!phone) {
      sendValidationError(res, "Phone number is required");
      return;
    }

    const history = await WhatsAppService.getMessageHistory(phone, limit);
    sendSuccess(res, { messages: history, count: history.length });
  }));

  function generateDeviceFingerprint(req: Request): string {
    const userAgent = req.get('User-Agent') || '';
    const acceptLanguage = req.get('Accept-Language') || '';
    const acceptEncoding = req.get('Accept-Encoding') || '';
    
    const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}`;
    return crypto.createHash('sha256').update(fingerprintData).digest('hex');
  }

  function initializeSessionSecurity(req: Request): void {
    if (req.session) {
      req.session.createdAt = Date.now();
      req.session.lastActivity = Date.now();
      req.session.lastIP = (req.ip || req.connection.remoteAddress || null) ?? undefined;
      req.session.userAgent = req.get('User-Agent') || undefined;
      req.session.deviceFingerprint = generateDeviceFingerprint(req);
    }
  }

  function validateSessionSecurity(req: Request): { valid: boolean; reason?: string } {
    if (!req.session || !req.session.createdAt) {
      return { valid: false, reason: 'INVALID_SESSION' };
    }

    const now = Date.now();
    const sessionAge = now - req.session.createdAt;
    const MAX_SESSION_AGE = 24 * 60 * 60 * 1000;
    
    if (sessionAge > MAX_SESSION_AGE) {
      return { valid: false, reason: 'SESSION_EXPIRED' };
    }

    const isReplit = !!(process.env.REPL_SLUG || process.env.REPL_OWNER || process.env.REPLIT_DB_URL);
    
    const currentDeviceFingerprint = generateDeviceFingerprint(req);
    if (!isReplit && req.session.deviceFingerprint && req.session.deviceFingerprint !== currentDeviceFingerprint) {
      console.warn(`[SECURITY] Device fingerprint mismatch for user ${req.user?.id}`);
      return { valid: false, reason: 'DEVICE_MISMATCH' };
    }

    const currentIP = req.ip || req.connection.remoteAddress;
    if (!isReplit && req.session.lastIP && req.session.lastIP !== currentIP) {
      console.warn(`[SECURITY] Session IP change detected: ${req.session.lastIP} -> ${currentIP} for user ${req.user?.id}`);
    }

    req.session.lastActivity = Date.now();
    req.session.lastIP = currentIP;
    
    return { valid: true };
  }

  const ADMIN_RATE_LIMIT = 100;
  const RATE_LIMIT_WINDOW = 60 * 1000;

  let cleanupIntervalId: NodeJS.Timeout | null = null;
  
  function startRateLimitCleanup() {

    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
    }

    cleanupIntervalId = setInterval(async () => {
      try {
        const storage = await getStorage();
        const cleanedCount = await storage.cleanupExpiredRateLimits();
        if (cleanedCount > 0) {
        }
      } catch (error) {
        console.error('[RATE_LIMIT_CLEANUP] Failed to cleanup expired rate limits:', error);
      }
    }, 10 * 60 * 1000);
    
  }

  startRateLimitCleanup();

  const createEnhancedAdminMiddleware = (options: {
    action: string;
    resource: string;
    validateInput?: AdminValidationFunction;
    rateLimit?: number;
  }) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const { action, resource, validateInput, rateLimit = ADMIN_RATE_LIMIT } = options;

      if (!req.user) {
        return res.status(401).json({ 
          message: "Authentication required",
          code: "AUTH_REQUIRED" 
        });
      }

      if (req.user.role !== "admin") {
        return res.status(403).json({ 
          message: "Admin access required",
          code: "INSUFFICIENT_PRIVILEGES" 
        });
      }

      try {
        const storage = await getStorage();
        const dbUser = await storage.getUser(req.user.id);
        
        if (!dbUser) {
          console.warn(`[SECURITY] Admin user ${req.user.id} not found in database during request`);
          return res.status(401).json({ 
            message: "User account not found. Please login again.",
            code: "USER_NOT_FOUND" 
          });
        }
        
        if (dbUser.role !== "admin") {
          console.warn(`[SECURITY] User ${req.user.id} role changed from admin to ${dbUser.role}`);
          return res.status(403).json({ 
            message: "Admin privileges have been revoked",
            code: "PRIVILEGES_REVOKED" 
          });
        }
        
        req.user = dbUser;
      } catch (error) {
        console.error('[SECURITY] Database verification error:', error);
        return res.status(500).json({ 
          message: "Security verification failed",
          code: "VERIFICATION_ERROR" 
        });
      }

      if (req.session) {

        const now = Date.now();
        const sessionAge = req.session.createdAt ? now - req.session.createdAt : 0;
        const MAX_ADMIN_SESSION_AGE = 8 * 60 * 60 * 1000;
        
        if (!req.session.createdAt) {
          return res.status(401).json({ 
            message: "Invalid session. Please login again.",
            code: "INVALID_SESSION" 
          });
        }
        
        if (sessionAge > MAX_ADMIN_SESSION_AGE) {
          return res.status(401).json({ 
            message: "Admin session expired. Please login again.",
            code: "SESSION_EXPIRED" 
          });
        }

        const isReplit = !!(process.env.REPL_SLUG || process.env.REPL_OWNER || process.env.REPLIT_DB_URL);
        const currentDeviceFingerprint = generateDeviceFingerprint(req);
        
        if (!isReplit && req.session.deviceFingerprint && req.session.deviceFingerprint !== currentDeviceFingerprint) {
          console.error(`[SECURITY] Admin device fingerprint mismatch for user ${req.user.id}`);
          return res.status(401).json({ 
            message: "Session security violation detected. Please login again.",
            code: "DEVICE_MISMATCH" 
          });
        }
        
        const currentIP = req.ip || req.connection.remoteAddress;
        
        if (!isReplit && req.session.lastIP && req.session.lastIP !== currentIP) {
          console.warn(`[SECURITY] Admin session IP change detected: ${req.session.lastIP} -> ${currentIP} for user ${req.user.id}`);
        }
        
        req.session.lastIP = currentIP;
        req.session.lastActivity = Date.now();
      }

      const userId = req.user.id;
      
      try {
        const storage = await getStorage();
        const rateResult = await storage.checkAndIncrementRateLimit(userId, RATE_LIMIT_WINDOW);
        
        if (rateResult.withinWindow && rateResult.count > rateLimit) {
          const now = Date.now();
          return res.status(429).json({ 
            message: "Rate limit exceeded. Please try again later.",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter: Math.ceil((rateResult.resetTime - now) / 1000)
          });
        }
      } catch (error) {
        console.error('[RATE_LIMIT] Storage error, allowing request:', error);
      }

      if (validateInput) {
        const validationError = validateInput(req);
        if (validationError) {
          return res.status(400).json({ 
            message: validationError,
            code: "VALIDATION_ERROR" 
          });
        }
      }

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

  const requireAdmin = createEnhancedAdminMiddleware({
    action: "access",
    resource: "admin_area"
  });

  function captureEntitySnapshot(entity: any): Record<string, any> {
    if (!entity || typeof entity !== 'object') {
      return {};
    }
    
    const { password, ...safe } = entity;
    return safe;
  }

  const logAdminAction = async (req: Request, res: Response, additionalData?: Record<string, unknown>) => {
    if (!req.adminContext) return;
    
    try {
      const storage = await getStorage();
      const { action, resource, adminUserId, ipAddress, userAgent } = req.adminContext;
      
      const auditLog = {
        adminUserId,
        action,
        resource,
        resourceId: (req.params.id || additionalData?.resourceId || null) as string | null,
        oldValue: additionalData?.oldValue ? JSON.stringify(additionalData.oldValue) : null,
        newValue: additionalData?.newValue ? JSON.stringify(additionalData.newValue) : null,
        ipAddress,
        userAgent,
        additionalInfo: (additionalData?.additionalInfo ? JSON.stringify(additionalData.additionalInfo) : null) as string | null
      };
      
      await storage.logAdminAction(auditLog);
    } catch (error) {
      console.error('[AUDIT] Failed to log admin action:', error);
    }
  };

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
      rateLimit: 20,
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

        const oldRole = existingUser.role;

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

        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: { role: oldRole, email: existingUser.email, name: existingUser.name },
          newValue: { role: role, email: updatedUser.email, name: updatedUser.name },
          additionalInfo: `Role changed from ${oldRole} to ${role}`
        });

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

  app.post("/api/admin/users", 
    createEnhancedAdminMiddleware({
      action: "create",
      resource: "user",
      rateLimit: 20,
      validateInput: (req) => {
        const { email, name, password, role } = req.body;
        if (!email || !name || !password || !role) {
          return "Email, name, password, and role are required";
        }
        if (!["customer", "admin"].includes(role)) {
          return "Role must be either customer or admin";
        }
        return null;
      }
    }),
    asyncRoute("create user", async (req: Request, res: Response) => {
      const validationResult = adminCreateUserSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errorMessage = fromZodError(validationResult.error).toString();
        await logAdminAction(req, res, {
          additionalInfo: `Validation failed: ${errorMessage}`
        });
        return sendValidationError(res, "Invalid user data", [errorMessage]);
      }

      const { email, name, password, role, phone, countryCode } = validationResult.data;
      const storage = await getStorage();

      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedName = sanitizeUsername(name);
      const sanitizedPhone = phone ? sanitizePhone(phone) : undefined;

      const existingUser = await storage.getUserByEmail(sanitizedEmail);
      if (existingUser) {
        await logAdminAction(req, res, {
          additionalInfo: `Attempted to create duplicate user: ${sanitizedEmail}`
        });
        return sendConflictError(res, "A user with this email already exists");
      }

      const hashedPassword = await hashPassword(password);

      const newUser = await storage.createUser({
        email: sanitizedEmail,
        name: sanitizedName,
        password: hashedPassword,
        role,
        phone: sanitizedPhone,
        countryCode: countryCode || "+91",
        provider: "email",
        emailVerified: false,
        preferredNotificationChannel: "whatsapp"
      });

      await logAdminAction(req, res, {
        resourceId: newUser.id,
        newValue: { email: newUser.email, name: newUser.name, role: newUser.role },
        additionalInfo: `Created new ${role} user: ${sanitizedEmail}`
      });

      const { password: _, ...safeUser } = newUser;
      res.status(201).json({ message: "User created successfully", user: safeUser });
    })
  );

  app.put("/api/admin/users/:id", 
    createEnhancedAdminMiddleware({
      action: "update",
      resource: "user",
      rateLimit: 30,
      validateInput: (req) => {
        const { id } = req.params;
        if (!id) {
          return "User ID is required";
        }
        return null;
      }
    }),
    asyncRoute("update user", async (req: Request, res: Response) => {
      const { id } = req.params;
      const validationResult = adminUpdateUserSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errorMessage = fromZodError(validationResult.error).toString();
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Validation failed: ${errorMessage}`
        });
        return sendValidationError(res, "Invalid user data", [errorMessage]);
      }

      const storage = await getStorage();
      const existingUser = await storage.getUser(id);
      
      if (!existingUser) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Attempted to update non-existent user ${id}`
        });
        return sendNotFoundError(res, "User not found");
      }

      const updates = validationResult.data;
      const sanitizedUpdates: Partial<User> = {};

      if (updates.name) sanitizedUpdates.name = sanitizeUsername(updates.name);
      if (updates.email) sanitizedUpdates.email = sanitizeEmail(updates.email);
      if (updates.phone) sanitizedUpdates.phone = sanitizePhone(updates.phone);
      if (updates.countryCode) sanitizedUpdates.countryCode = updates.countryCode;
      if (updates.address) sanitizedUpdates.address = sanitizeAddress(updates.address);
      if (updates.city) sanitizedUpdates.city = sanitizeString(updates.city);
      if (updates.state) sanitizedUpdates.state = sanitizeString(updates.state);
      if (updates.zipCode) sanitizedUpdates.zipCode = sanitizeString(updates.zipCode);

      if (updates.email && updates.email !== existingUser.email) {
        const emailExists = await storage.getUserByEmail(sanitizedUpdates.email!);
        if (emailExists && emailExists.id !== id) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Email already in use: ${updates.email}`
          });
          return sendConflictError(res, "Email already in use by another user");
        }
      }

      const updatedUser = await storage.updateUser(id, sanitizedUpdates);
      
      if (!updatedUser) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: "Failed to update user"
        });
        return sendError(res, "Failed to update user", 500);
      }

      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: captureEntitySnapshot(existingUser),
        newValue: captureEntitySnapshot(updatedUser),
        additionalInfo: `Updated user profile: ${updatedUser.email}`
      });

      const { password: _, ...safeUser } = updatedUser;
      res.json({ message: "User updated successfully", user: safeUser });
    })
  );

  app.delete("/api/admin/users/:id", 
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "user",
      rateLimit: 20,
      validateInput: (req) => {
        const { id } = req.params;
        if (!id) {
          return "User ID is required";
        }
        return null;
      }
    }),
    asyncRoute("delete user", async (req: Request, res: Response) => {
      const { id } = req.params;
      const storage = await getStorage();
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Attempted to delete non-existent user ${id}`
        });
        return sendNotFoundError(res, "User not found");
      }

      const currentUser = req.user as any;
      if (currentUser.id === id) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: "Prevented self-deletion attempt"
        });
        return sendForbiddenError(res, "You cannot delete your own account");
      }

      try {
        await storage.deleteUser(id);
        
        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: captureEntitySnapshot(existingUser),
          additionalInfo: `Deleted user: ${existingUser.email || existingUser.phone}`
        });

        sendResourceDeleted(res, "User deleted successfully");
      } catch (error: any) {
        if (error.code === "FOREIGN_KEY_VIOLATION") {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Failed to delete user due to dependencies: ${error.message}`
          });
          return sendConflictError(res, error.message);
        }
        throw error;
      }
    })
  );

  app.post("/api/admin/users/:id/reset-password", 
    createEnhancedAdminMiddleware({
      action: "reset_password",
      resource: "user",
      rateLimit: 20,
      validateInput: (req) => {
        const { id } = req.params;
        const { newPassword } = req.body;
        if (!id) {
          return "User ID is required";
        }
        if (!newPassword) {
          return "New password is required";
        }
        return null;
      }
    }),
    asyncRoute("reset user password", async (req: Request, res: Response) => {
      const { id } = req.params;
      const validationResult = adminResetPasswordSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errorMessage = fromZodError(validationResult.error).toString();
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Password validation failed: ${errorMessage}`
        });
        return sendValidationError(res, "Invalid password", [errorMessage]);
      }

      const { newPassword } = validationResult.data;
      const storage = await getStorage();
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Attempted to reset password for non-existent user ${id}`
        });
        return sendNotFoundError(res, "User not found");
      }

      const hashedPassword = await hashPassword(newPassword);
      const updatedUser = await storage.updateUser(id, { password: hashedPassword });
      
      if (!updatedUser) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: "Failed to reset password"
        });
        return sendError(res, "Failed to reset password", 500);
      }

      await logAdminAction(req, res, {
        resourceId: id,
        additionalInfo: `Password reset for user: ${existingUser.email || existingUser.phone}`
      });

      sendSuccess(res, "Password reset successfully");
    })
  );

  app.patch("/api/admin/users/:id/status",
    createEnhancedAdminMiddleware({
      action: "status_change",
      resource: "user",
      rateLimit: 20,
      validateInput: (req) => {
        const { id } = req.params;
        const { isActive } = req.body;
        if (!id || typeof id !== 'string') return "Invalid user ID";
        if (typeof isActive !== 'boolean') return "isActive must be boolean";
        return null;
      }
    }),
    asyncRoute("toggle user account status", async (req: Request, res: Response) => {
      const { id } = req.params;
      const { isActive } = req.body;
      const storage = await getStorage();
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        await logAdminAction(req, res, { resourceId: id, additionalInfo: "Attempted to update non-existent user status" });
        return res.status(404).json({ message: "User not found" });
      }
      
      const currentUser = req.user as any;
      if (currentUser.id === id) {
        await logAdminAction(req, res, { resourceId: id, additionalInfo: "Prevented self-suspension" });
        return res.status(400).json({ message: "You cannot suspend your own account" });
      }
      
      const updatedUser = await storage.updateUser(id, { isActive });
      
      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: { isActive: existingUser.isActive },
        newValue: { isActive },
        additionalInfo: `Account ${isActive ? 'activated' : 'suspended'}`
      });
      
      const { password, ...safeUser } = updatedUser!;
      res.json({ message: `Account ${isActive ? 'activated' : 'suspended'}`, user: safeUser });
    })
  );

  app.get("/api/admin/stats", requireAdmin, asyncRoute("get admin dashboard statistics", async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      const storage = await getStorage();
      
      // Parallelize all storage calls for optimal performance
      const [
        appointments,
        userCount,
        services,
        locations,
        cars
      ] = await Promise.all([
        storage.getAllAppointments(),
        storage.getUserCount(),
        storage.getAllServices(),
        storage.getAllLocations(),
        storage.getAllCars()
      ]);

      const sourceResults = {
        appointments: { success: true, data: appointments },
        users: { success: true, data: userCount },
        services: { success: true, data: services },
        locations: { success: true, data: locations },
        cars: { success: true, data: cars }
      };

      const successfulSources = 5;
      const totalSources = 5;
      const failedSources: string[] = [];

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      const stats: AdminStatsResponse = {

        totalUsers: userCount,
        totalUsersAvailable: true,

        totalAppointments: appointments.length,
        appointmentsAvailable: true,
        pendingAppointments: appointments.filter(a => a.status === "pending").length,
        confirmedAppointments: appointments.filter(a => a.status === "confirmed").length,
        completedAppointments: appointments.filter(a => a.status === "completed").length,
        cancelledAppointments: appointments.filter(a => a.status === "cancelled").length,
        recentAppointments: appointments.filter(a => new Date(a.createdAt) > thirtyDaysAgo).length,

        totalServices: services.length,
        servicesAvailable: true,
        popularServices: services.filter(s => s.popular).length,

        totalLocations: locations.length,
        locationsAvailable: true,

        totalCars: cars.length,
        carsAvailable: true,
        activeCars: cars.filter(c => !c.isAuction).length,
        auctionCars: cars.filter(c => c.isAuction).length,
        activeAuctions: cars.filter(c => c.isAuction && c.auctionEndTime && new Date(c.auctionEndTime) > now).length,

        lastUpdated: new Date().toISOString(),
        cacheStatus: {
          appointments: 'fresh',
          users: 'fresh',
          services: 'fresh',
          locations: 'fresh',
          cars: 'fresh'
        },
        reliability: {
          totalSources,
          availableSources: successfulSources,
          failedSources,
          successRate: 100
        }
      };

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

      const statusCode = 200;

      const duration = Date.now() - startTime;
      console.log(`[PERF] GET /api/admin/stats completed in ${duration}ms`);
      res.status(statusCode).json(stats);
      
    } catch (error) {
      const duration = Date.now() - startTime;

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

  app.delete("/api/admin/images/profile/:userId", 
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "profile_image",
      rateLimit: 30,
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

        await storage.updateUser(userId, { profileImage: null });

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
      rateLimit: 30,
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

        await storage.updateCar(carId, { image: "" });

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

        await logAdminAction(req, res, {
          resourceId: carId,
          additionalInfo: `Error deleting car image: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "delete car image", res);
      }
    })
  );

  app.get("/api/services", publicDataLimiter, asyncRoute("fetch services", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const storage = await getStorage();
    const services = await storage.getAllServices();
    const duration = Date.now() - startTime;
    
    console.log(`[PERF] GET /api/services completed in ${duration}ms`);
    res.json(services);
  }));

  app.get("/api/services/category/:category", searchQueryLimiter, asyncRoute("fetch services by category", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { category } = req.params;
    const storage = await getStorage();
    const services = await storage.getServicesByCategory(category);
    const duration = Date.now() - startTime;
    
    console.log(`[PERF] GET /api/services/category/${category} completed in ${duration}ms`);
    res.json(services);
  }));

  app.get("/api/services/:id", publicDataLimiter, asyncRoute("fetch service", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { id } = req.params;
    const storage = await getStorage();
    const service = await storage.getService(id);
    const duration = Date.now() - startTime;
    
    if (!service) {
      return sendNotFoundError(res, "Service not found");
    }
    
    console.log(`[PERF] GET /api/services/${id} completed in ${duration}ms`);
    res.json(service);
  }));

  app.post("/api/services", 
    createEnhancedAdminMiddleware({
      action: "create",
      resource: "service",
      rateLimit: 30,
      validateInput: (req) => {
        const { title, description, price, category, duration, features } = req.body;
        
        if (!title || typeof title !== 'string') {
          return "Service title is required and must be a string";
        }
        if (!description || typeof description !== 'string') {
          return "Service description is required and must be a string";
        }
        if (price === undefined || typeof price !== 'number' || price < 0) {
          return "Service price is required and must be a non-negative number";
        }
        if (!category || typeof category !== 'string') {
          return "Service category is required and must be a string";
        }
        if (!duration || typeof duration !== 'string') {
          return "Service duration is required and must be a string";
        }

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

        const sanitizedData = {
          ...validatedData,
          title: sanitizeString(validatedData.title),
          description: sanitizeMessage(validatedData.description),
          category: sanitizeString(validatedData.category),
          features: validatedData.features?.map(value => sanitizeString(value))
        };
        
        const service = await storage.createService(sanitizedData);

        await logAdminAction(req, res, {
          resourceId: service.id,
          newValue: captureEntitySnapshot(service),
          additionalInfo: 'Service created successfully'
        });

        cacheManager.invalidateServiceCaches(service.id, service.category);
        
        res.status(201).json(service);
      } catch (error) {

        await logAdminAction(req, res, {
          additionalInfo: `Failed to create service: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "create service", res);
      }
    })
  );

  app.put("/api/services/:id", 
    createEnhancedAdminMiddleware({
      action: "update",
      resource: "service",
      rateLimit: 40,
      validateInput: (req) => {
        const { id } = req.params;
        if (!id || typeof id !== 'string') {
          return "Invalid service ID format";
        }

        return null;
      }
    }),
    asyncRoute("update service", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const storage = await getStorage();

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

        const validatedData = insertServiceSchema.partial().parse(req.body);

        const sanitizedData: any = { ...validatedData };
        if (validatedData.title) sanitizedData.title = sanitizeString(validatedData.title);
        if (validatedData.description) sanitizedData.description = sanitizeMessage(validatedData.description);
        if (validatedData.category) sanitizedData.category = sanitizeString(validatedData.category);
        if (validatedData.features) sanitizedData.features = validatedData.features.map(value => sanitizeString(value));
        
        const updatedService = await storage.updateService(id, sanitizedData);
        
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

        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: captureEntitySnapshot(existingService),
          newValue: captureEntitySnapshot(updatedService),
          additionalInfo: 'Service updated successfully'
        });

        const prevCategory = existingService.category;
        const nextCategory = validatedData.category || prevCategory;
        cacheManager.invalidateServiceCaches(id, prevCategory, nextCategory);
        
        res.json(updatedService);
      } catch (error) {

        await logAdminAction(req, res, {
          resourceId: req.params.id,
          additionalInfo: `Error updating service: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "update service", res);
      }
    })
  );

  app.delete("/api/services/:id", 
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "service",
      rateLimit: 20,
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

        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: captureEntitySnapshot(existingService),
          additionalInfo: 'Service deleted successfully'
        });

        cacheManager.invalidateServiceCaches(id, existingService.category);
        
        res.status(204).send();
      } catch (error) {

        await logAdminAction(req, res, {
          resourceId: req.params.id,
          additionalInfo: `Error deleting service: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "delete service", res);
      }
    })
  );

  app.post("/api/invoices",
    createEnhancedAdminMiddleware({
      action: "create",
      resource: "invoice",
      rateLimit: 30,
      validateInput: (req) => {
        if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
          return "Invoice must have at least one item";
        }
        return null;
      }
    }),
    asyncRoute("create invoice", async (req: Request, res: Response) => {
      try {
        const storage = await getStorage();
        const { items, ...invoiceData } = req.body;

        const invoiceNumber = invoiceService.generateInvoiceNumber();
        const dataWithInvoiceNumber = {
          ...invoiceData,
          invoiceNumber
        };

        const validation = invoiceService.validateInvoice(dataWithInvoiceNumber);
        if (!validation.success) {
          await logAdminAction(req, res, {
            additionalInfo: `Invoice validation failed: ${validation.error}`
          });
          return sendValidationError(res, "Invoice validation failed", [validation.error]);
        }

        const validationErrors: string[] = [];
        const validatedItems: any[] = [];

        for (let i = 0; i < items.length; i++) {
          const itemValidation = insertInvoiceItemSchema.safeParse(items[i]);
          if (!itemValidation.success) {
            validationErrors.push(`Item ${i + 1}: ${fromZodError(itemValidation.error).toString()}`);
          } else {
            validatedItems.push(itemValidation.data);
          }
        }

        if (validationErrors.length > 0) {
          await logAdminAction(req, res, {
            additionalInfo: `Invoice item validation failed: ${validationErrors.join('; ')}`
          });
          return sendValidationError(res, "Invoice item validation failed", validationErrors);
        }

        const invoice = await storage.createInvoice(validation.data, validatedItems);

        await logAdminAction(req, res, {
          resourceId: invoice.id,
          newValue: captureEntitySnapshot(invoice),
          additionalInfo: `Invoice ${invoice.invoiceNumber} created successfully`
        });

        sendResourceCreated(res, invoice, "Invoice created successfully");
      } catch (error) {
        await logAdminAction(req, res, {
          additionalInfo: `Error creating invoice: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "create invoice", res);
      }
    })
  );

  app.get("/api/invoices",
    createEnhancedAdminMiddleware({
      action: "read",
      resource: "invoice",
      rateLimit: 60,
      validateInput: (req) => {
        const { page, limit } = req.query;
        if (page && (isNaN(Number(page)) || Number(page) < 1)) {
          return "Invalid page number";
        }
        if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
          return "Invalid limit value";
        }
        return null;
      }
    }),
    asyncRoute("get invoices", async (req: Request, res: Response) => {
      try {
        const storage = await getStorage();
        const filters = {
          page: req.query.page ? parseInt(req.query.page as string) : undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          status: req.query.status as string | undefined,
          customerEmail: req.query.customerEmail as string | undefined,
          customerPhone: req.query.customerPhone as string | undefined,
          startDate: req.query.startDate as string | undefined,
          endDate: req.query.endDate as string | undefined
        };

        const result = await storage.getInvoices(filters);

        await logAdminAction(req, res, {
          additionalInfo: `Retrieved ${result.invoices.length} invoices (page: ${filters.page || 1}, total: ${result.total})`
        });

        sendPaginatedResponse(res, result.invoices, result.total, filters.page || 1, filters.limit || 20);
      } catch (error) {
        await logAdminAction(req, res, {
          additionalInfo: `Error fetching invoices: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "fetch invoices", res);
      }
    })
  );

  app.get("/api/invoices/:id",
    createEnhancedAdminMiddleware({
      action: "read",
      resource: "invoice",
      rateLimit: 60,
      validateInput: (req) => {
        const { id } = req.params;
        if (!id || typeof id !== 'string') {
          return "Invalid invoice ID format";
        }
        return null;
      }
    }),
    asyncRoute("get invoice by id", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const storage = await getStorage();

        const invoice = await storage.getInvoiceById(id);
        if (!invoice) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to access non-existent invoice ${id}`
          });
          return sendNotFoundError(res, "Invoice not found");
        }

        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Retrieved invoice ${invoice.invoiceNumber}`
        });

        res.json(invoice);
      } catch (error) {
        await logAdminAction(req, res, {
          resourceId: req.params.id,
          additionalInfo: `Error fetching invoice: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "fetch invoice", res);
      }
    })
  );

  app.delete("/api/invoices/:id",
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "invoice",
      rateLimit: 20,
      validateInput: (req) => {
        const { id } = req.params;
        if (!id || typeof id !== 'string') {
          return "Invalid invoice ID format";
        }
        return null;
      }
    }),
    asyncRoute("delete invoice", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const storage = await getStorage();

        const invoice = await storage.getInvoiceById(id);
        if (!invoice) {
          await logAdminAction(req, res, {
            resourceId: id,
            additionalInfo: `Attempted to delete non-existent invoice ${id}`
          });
          return sendNotFoundError(res, "Invoice not found");
        }

        await storage.deleteInvoice(id);

        await logAdminAction(req, res, {
          resourceId: id,
          oldValue: captureEntitySnapshot(invoice),
          additionalInfo: `Invoice ${invoice.invoiceNumber} deleted successfully`
        });

        res.status(204).send();
      } catch (error) {
        await logAdminAction(req, res, {
          resourceId: req.params.id,
          additionalInfo: `Error deleting invoice: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        handleApiError(error, "delete invoice", res);
      }
    })
  );

  app.post("/api/customers", requireAuth, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const user = req.user as any;

      const requestData = { ...req.body, userId: user.id };
      const validatedData = insertCustomerSchema.parse(requestData);

      const sanitizedData = {
        ...validatedData,
        name: sanitizeUsername(validatedData.name),
        email: sanitizeEmail(validatedData.email),
        phone: sanitizePhone(validatedData.phone),
        countryCode: sanitizeString(validatedData.countryCode)
      };
      
      const customer = await storage.createCustomer(sanitizedData);
      res.status(201).json(customer);
    } catch (error) {

      handleApiError(error, "create customer", res);
    }
  });

  app.post("/api/customers/ensure-own", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const storage = await getStorage();

      let customer = await storage.getCustomerByUserId(user.id);

      if (!customer) {
        customer = await storage.getCustomerByEmail(user.email);

        if (customer && !customer.userId) {
          try {
            const updatedCustomer = await storage.updateCustomer(customer.id, { userId: user.id });
            customer = updatedCustomer || customer;
          } catch (error) {

            console.warn("Failed to backfill userId for customer", customer.id, error);
          }
        }
      }
      
      if (!customer) {

        const customerData = {
          userId: user.id,
          name: user.name || "User",
          email: user.email,
          phone: user.phone || "Not provided",
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

  app.get("/api/customer/by-user/:userId", requireAuth, asyncRoute("get customer by user ID", async (req: Request, res: Response) => {
    const { userId } = req.params;
    const user = req.user as any;

    if (user.id !== userId) {
      return res.status(403).json({ message: "Unauthorized: You can only access your own customer information" });
    }
    
    const storage = await getStorage();
    const customer = await storage.getCustomerByUserId(userId);

    res.json(customer || null);
  }));

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
      rateLimit: 50,
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

        const oldStatus = existingAppointment.status;

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

  app.post("/api/appointments/check-conflict", requireAuth, asyncRoute("check appointment conflict", async (req: Request, res: Response) => {
    const startTime = Date.now();
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
    
    const duration = Date.now() - startTime;
    console.log(`[PERF] POST /api/appointments/check-conflict completed in ${duration}ms`);
    res.json({ hasConflict });
  }));

  app.get("/api/appointments/customer/:customerId", requireAuth, asyncRoute("fetch customer appointments", async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    const customer = await storage.getCustomer(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

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

    const appointment = await storage.getAppointmentWithDetails(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (user.role !== "admin") {

      const customer = await storage.getCustomer(appointment.customerId);
      if (!customer || customer.userId !== user.id) {
        return res.status(403).json({ 
          message: "Unauthorized: You can only access your own appointments" 
        });
      }
    }
    
    res.json(appointment);
  }));

  app.post("/api/appointments", appointmentCreationLimiter, requireAuth, asyncRoute("create appointment", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const storage = await getStorage();
      const user = req.user as any;
      const validatedData = insertAppointmentSchema.parse(req.body);

      const sanitizedAppointment = {
        ...validatedData,
        carDetails: sanitizeMessage(validatedData.carDetails),
        mechanicName: validatedData.mechanicName ? sanitizeUsername(validatedData.mechanicName) : undefined,
        estimatedDuration: sanitizeString(validatedData.estimatedDuration),
        notes: validatedData.notes ? sanitizeMessage(validatedData.notes) : undefined
      };

      let customer = await storage.getCustomerByUserId(user.id);
      if (!customer) {

        const customerData = {
          userId: user.id,
          name: sanitizeUsername(user.name || "User"),
          email: sanitizeEmail(user.email || `user-${user.id}@example.com`),
          phone: sanitizePhone(user.phone || "Not provided"),
          countryCode: sanitizeString(user.countryCode || "+91")
        };
        
        const validatedCustomerData = insertCustomerSchema.parse(customerData);
        customer = await storage.createCustomer(validatedCustomerData);
      }

      const appointmentWithCustomer = {
        ...sanitizedAppointment,
        customerId: customer.id
      };
      
      const appointment = await storage.createAppointment(appointmentWithCustomer);

      try {
        // Parallelize fetching customer, service, and location data
        const [customer, service, location] = await Promise.all([
          storage.getCustomer(appointment.customerId),
          storage.getService(appointment.serviceId),
          storage.getLocation(appointment.locationId)
        ]);
        
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

          if (customer.userId) {
            NotificationService.sendAppointmentConfirmation(customer.userId, appointmentData)
              .then((result) => {
                if (result.success) {
                } else {
                  console.error(`[APPOINTMENT] Notification failed: ${result.message}`);
                }
              })
              .catch((error) => {
                console.error(`[APPOINTMENT] Notification error: ${error.message}`);
              });
          } else {

            EmailNotificationService.sendAppointmentConfirmationAsync(customer.email, appointmentData);
          }

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

            WhatsAppService.sendServiceProviderNotification(
              service.providerPhone,
              service.providerCountryCode,
              serviceProviderData,
              appointment.id
            ).then((result: any) => {
              if (!result.success) {
                console.error(`[APPOINTMENT] Service provider notification failed: ${result.error}`);
              }
            }).catch((error: any) => {
              console.error(`[APPOINTMENT] Service provider notification error: ${error.message}`);
            });
          } else {

          }
        } else {
          console.error("[APPOINTMENT] Missing customer, service, or location data for notifications");
        }
      } catch (notificationError: unknown) {
        console.error(`[APPOINTMENT] Notification setup failed: ${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`);
      }

      const duration = Date.now() - startTime;
      console.log(`[PERF] POST /api/appointments completed in ${duration}ms`);
      res.status(201).json(appointment);
    } catch (error) {

      handleApiError(error, "create appointment", res);
    }
  }));

  app.patch("/api/appointments/:id/status", requireAuth, asyncRoute("update appointment status", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || typeof status !== "string") {
      return res.status(400).json({ message: "Status is required" });
    }

    const allowedStatuses = ["pending", "confirmed", "in-progress", "completed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}` 
      });
    }
    
    const storage = await getStorage();
    const user = req.user as any;

    const currentAppointment = await storage.getAppointment(id);
    if (!currentAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const customer = await storage.getCustomer(currentAppointment.customerId);
    if (!customer || customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only update your own appointments" 
      });
    }

    const validTransitions: { [key: string]: string[] } = {
      "pending": ["confirmed", "cancelled"],
      "confirmed": ["in-progress", "cancelled"],
      "in-progress": ["completed", "cancelled"],
      "completed": [],
      "cancelled": []
    };
    
    if (!validTransitions[currentAppointment.status]?.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from '${currentAppointment.status}' to '${status}'` 
      });
    }

    const updatedAppointment = await storage.updateAppointmentStatus(id, status);

    let notificationSent = false;
    let channelUsed = 'none';
    let fallbackUsed = false;
    
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
          status: status,
          bookingId: updatedAppointment!.id
        };

        if (customer.userId) {
          const result = await NotificationService.sendStatusUpdate(customer.userId, statusData);
          notificationSent = result.success;
          channelUsed = result.channelUsed || 'none';
          fallbackUsed = Boolean(result.fallbackUsed);
          
          if (!notificationSent) {
            console.error(`[STATUS] Notification failed: ${result.message}`);
          }
        } else {

          notificationSent = Boolean(await EmailNotificationService.sendAppointmentStatusUpdate(customer.email, statusData));
          channelUsed = 'email';
        }
      }
    } catch (notificationError: unknown) {
      console.error("Failed to send status update notifications:", notificationError instanceof Error ? notificationError.message : 'Unknown error');
      notificationSent = false;
    }
    
    res.json({
      message: "Appointment status updated successfully",
      appointment: updatedAppointment,
      notifications: {
        sent: notificationSent,
        channel: channelUsed,
        fallbackUsed: fallbackUsed,
        message: notificationSent 
          ? `Status update sent successfully via ${channelUsed}${fallbackUsed ? ' (fallback)' : ''}`
          : "Status updated but notification could not be sent"
      }
    });
  }));

  app.patch("/api/appointments/:id/reschedule", requireAuth, asyncRoute("reschedule appointment", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user as any;

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

      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const customer = await storage.getCustomer(appointment.customerId);

      const isAdmin = user.role === 'admin';

      if (!isAdmin && (!customer || customer.userId !== user.id)) {
        return res.status(403).json({ message: "You can only reschedule your own appointments" });
      }

      if (appointment.status !== "confirmed") {
        return res.status(400).json({ 
          message: `Cannot reschedule appointment with status '${appointment.status}'. Only confirmed appointments can be rescheduled.` 
        });
      }

      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(400).json({ message: "Invalid location ID. The specified location does not exist." });
      }

      const hasConflict = await storage.checkAppointmentConflict(
        locationId, 
        new Date(dateTime), 
        id
      );
      
      if (hasConflict) {
        return res.status(409).json({ 
          message: "Time slot conflict. Another appointment is already scheduled at this location and time. Please choose a different time." 
        });
      }

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

  app.get("/api/cars", searchQueryLimiter, async (req, res) => {
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

      if (hasFilters) {
        const storage = await getStorage();
        const cars = await storage.getAllCars(0, 100, filters);
        return res.json(cars);
      }

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

  app.get("/api/cars/sale", publicDataLimiter, async (req, res) => {
    const startTime = Date.now();
    try {
      const storage = await getStorage();
      const cars = await storage.getCarsForSale();
      const duration = Date.now() - startTime;
      console.log(`[PERF] GET /api/cars/sale completed in ${duration}ms`);
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars for sale" });
    }
  });

  app.get("/api/cars/auctions", publicDataLimiter, async (req, res) => {
    const startTime = Date.now();
    try {
      const storage = await getStorage();
      const cars = await storage.getAuctionCars();
      const duration = Date.now() - startTime;
      console.log(`[PERF] GET /api/cars/auctions completed in ${duration}ms`);
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auction cars" });
    }
  });

  app.get("/api/cars/:id", publicDataLimiter, asyncRoute("fetch car", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { id } = req.params;
    const storage = await getStorage();
    const car = await storage.getCar(id);
    const duration = Date.now() - startTime;
    
    if (!car) {
      return sendNotFoundError(res, "Car not found");
    }
    
    console.log(`[PERF] GET /api/cars/${id} completed in ${duration}ms`);
    res.json(car);
  }));

  app.post("/api/cars", requireAdmin, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const validatedData = insertCarSchema.parse(req.body);

      const sanitizedData = {
        ...validatedData,
        make: sanitizeString(validatedData.make),
        model: sanitizeString(validatedData.model),
        location: sanitizeString(validatedData.location),
        condition: sanitizeString(validatedData.condition),
        image: sanitizeUrl(validatedData.image),
        description: validatedData.description ? sanitizeMessage(validatedData.description) : undefined,
        transmission: validatedData.transmission ? sanitizeString(validatedData.transmission) : undefined,
        bodyType: validatedData.bodyType ? sanitizeString(validatedData.bodyType) : undefined,
        color: validatedData.color ? sanitizeString(validatedData.color) : undefined,
        engineSize: validatedData.engineSize ? sanitizeString(validatedData.engineSize) : undefined,
        features: validatedData.features ? sanitizeMessage(validatedData.features) : undefined,
        fuelType: sanitizeString(validatedData.fuelType)
      };
      
      const car = await storage.createCar(sanitizedData);

      await logAdminAction(req, res, {
        resourceId: car.id,
        newValue: captureEntitySnapshot(car),
        additionalInfo: 'Car created successfully'
      });

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

  app.post("/api/cars/:id/images", requireAdmin, asyncRoute("upload car image", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();

    const car = await storage.getCar(id);
    if (!car) {
      return sendNotFoundError(res, "Car not found");
    }

    const validatedData = insertCarImageSchema.parse({
      carId: id,
      ...req.body
    });

    const carImage = await storage.createCarImage(validatedData);

    cacheManager.invalidateCarCaches(id);
    
    sendResourceCreated(res, carImage, "Car image uploaded successfully");
  }));

  app.delete("/api/cars/images/:imageId", requireAdmin, asyncRoute("delete car image", async (req: Request, res: Response) => {
    const { imageId } = req.params;
    const storage = await getStorage();

    await storage.deleteCarImage(imageId);

    cacheManager.invalidateCarCaches();
    
    sendResourceDeleted(res, "Car image deleted successfully");
  }));

  app.post("/api/cars/:carId/bids", bidPlacementLimiter, requireAuth, async (req, res) => {
    try {
      const { carId } = req.params;
      const user = req.user as any;
      const storage = await getStorage();

      const validationResult = placeBidSchema.safeParse({ ...req.body, carId });
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => err.message).join(", ");
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: errorMessages 
        });
      }
      
      const { bidAmount } = validationResult.data;

      const car = await storage.getCar(carId);
      if (!car) {
        return res.status(404).json({ message: "Car not found" });
      }
      
      if (!car.isAuction) {
        return res.status(400).json({ message: "This car is not available for auction" });
      }

      if (car.auctionEndTime && new Date() > new Date(car.auctionEndTime)) {
        return res.status(400).json({ message: "Auction has ended" });
      }

      const currentHighestBid = await storage.getHighestBidForCar(carId);
      const minimumBid = currentHighestBid ? currentHighestBid.bidAmount + 1000 : car.price;
      
      if (bidAmount < minimumBid) {
        return res.status(400).json({ 
          message: `Bid must be at least ₹${minimumBid.toLocaleString('en-IN')}` 
        });
      }

      const bid = await storage.placeBid({
        carId,
        bidderEmail: user.email,
        bidAmount
      });

      await storage.updateCarCurrentBid(carId, bidAmount);
      
      cacheManager.invalidateBidCaches();

      setImmediate(async () => {
        try {
          const carDetails = `${car.make} ${car.model} ${car.year}`;

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
            } else {
              console.error(`[BID] WhatsApp confirmation failed: ${result.error}`);
            }
          } else {
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

  app.get("/api/cars/:carId/bids", publicDataLimiter, async (req, res) => {
    try {
      const { carId } = req.params;
      const storage = await getStorage();

      const carResult = await getCachedCar(carId);
      if (!carResult.success || !carResult.data) {
        return res.status(404).json({ message: "Car not found" });
      }

      const bids = await storage.getBidsForCar(carId);
      res.json(bids);
      
    } catch (error) {
      console.error("Get bids error:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  // Admin bid management endpoints
  app.get("/api/admin/bids", requireAdmin, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const carId = req.query.carId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const minAmount = req.query.minAmount ? parseInt(req.query.minAmount as string) : undefined;
      const maxAmount = req.query.maxAmount ? parseInt(req.query.maxAmount as string) : undefined;

      const result = await storage.getAllBids({
        page,
        limit,
        status,
        carId,
        startDate,
        endDate,
        minAmount,
        maxAmount
      });

      res.json({
        bids: result.bids,
        pagination: {
          page,
          limit,
          total: result.total,
          hasMore: result.hasMore,
          totalPages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      console.error("Get admin bids error:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  app.get("/api/admin/bids/analytics", requireAdmin, async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const analyticsResult = await getCachedBidAnalytics();
      
      if (!analyticsResult.success) {
        throw analyticsResult.error || new Error('Failed to fetch bid analytics');
      }
      
      const duration = Date.now() - startTime;
      console.log(`[PERF] GET /api/admin/bids/analytics completed in ${duration}ms`);
      
      res.json(analyticsResult.data);
    } catch (error) {
      console.error("Get bid analytics error:", error);
      res.status(500).json({ message: "Failed to fetch bid analytics" });
    }
  });

  app.patch("/api/admin/bids/:bidId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bidId } = req.params;
      const { status } = req.body;

      if (!status || !["accepted", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'accepted' or 'rejected'" });
      }

      const storage = await getStorage();
      const bid = await storage.getBidById(bidId);

      if (!bid) {
        return res.status(404).json({ message: "Bid not found" });
      }

      if (bid.status !== "pending") {
        return res.status(400).json({ message: "Only pending bids can be updated" });
      }

      const updatedBid = await storage.updateBidStatus(bidId, status);

      if (!updatedBid) {
        return res.status(500).json({ message: "Failed to update bid status" });
      }
      
      cacheManager.invalidateBidCaches();

      if (updatedBid.userId) {
        const car = await storage.getCar(updatedBid.carId);
        
        setImmediate(async () => {
          try {
            const result = await NotificationService.sendBidStatusUpdate(
              updatedBid.userId!,
              {
                bidId: updatedBid.id,
                carDetails: car ? `${car.year} ${car.make} ${car.model}` : "the vehicle",
                bidAmount: updatedBid.bidAmount,
                status: status as "accepted" | "rejected"
              }
            );

            if (result.success) {
              console.log(`[BID_STATUS] Notification sent successfully via ${result.channelUsed}`);
            } else {
              console.error(`[BID_STATUS] Failed to send notification: ${result.message}`);
            }
          } catch (notificationError) {
            console.error(`[BID_STATUS] Notification error:`, notificationError);
          }
        });
      }

      res.json({
        message: `Bid ${status} successfully`,
        bid: updatedBid
      });

    } catch (error) {
      console.error("Update bid status error:", error);
      res.status(500).json({ message: "Failed to update bid status" });
    }
  });

  app.post("/api/contacts", contactFormLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const storage = await getStorage();
      const validatedData = insertContactSchema.parse(req.body);
      
      const sanitizedData = {
        ...validatedData,
        name: sanitizeUsername(validatedData.name),
        email: sanitizeEmail(validatedData.email),
        phone: validatedData.phone ? sanitizePhone(validatedData.phone) || '' : '',
        message: sanitizeMessage(validatedData.message)
      };
      
      const contact = await storage.createContact(sanitizedData);
      res.status(201).json(contact);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create contact" });
      }
    }
  });

  app.get("/api/locations", publicDataLimiter, async (req: Request, res: Response) => {
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

  app.get("/api/locations/:id", publicDataLimiter, asyncRoute("fetch location", async (req: Request, res: Response) => {
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

      const sanitizedData = {
        ...validatedData,
        name: sanitizeString(validatedData.name),
        address: sanitizeAddress(validatedData.address)
      };
      
      const location = await storage.createLocation(sanitizedData);

      await logAdminAction(req, res, {
        resourceId: location.id,
        newValue: captureEntitySnapshot(location),
        additionalInfo: 'Location created successfully'
      });

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

    const validatedData = insertLocationSchema.parse(req.body);

    const sanitizedData = {
      ...validatedData,
      name: sanitizeString(validatedData.name),
      address: sanitizeAddress(validatedData.address)
    };

    const locationResult = await getCachedLocation(id);
    if (!locationResult.success || !locationResult.data) {
      return res.status(404).json({ message: "Location not found" });
    }
    const existingLocation = locationResult.data;
    
    const updatedLocation = await storage.updateLocation(id, sanitizedData);

    await logAdminAction(req, res, {
      resourceId: id,
      oldValue: captureEntitySnapshot(existingLocation),
      newValue: captureEntitySnapshot(updatedLocation),
      additionalInfo: 'Location updated successfully'
    });

    cacheManager.invalidateLocationCaches(id);
    
    res.json(updatedLocation);
  }));

  app.delete("/api/locations/:id", requireAdmin, asyncRoute("delete location", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();

    const locationResult = await getCachedLocation(id);
    if (!locationResult.success || !locationResult.data) {
      return res.status(404).json({ message: "Location not found" });
    }
    const existingLocation = locationResult.data;

    const locationAppointments = await storage.getAppointmentsByLocation(id);
    
    if (locationAppointments.length > 0) {

      const activeAppointments = locationAppointments.filter(
        apt => apt.status !== 'cancelled' && apt.status !== 'completed'
      );
      
      return res.status(400).json({ 
        message: `Cannot delete location with ${locationAppointments.length} existing appointment(s) (${activeAppointments.length} active). Please reassign or cancel these appointments first.`,
        code: 'LOCATION_HAS_APPOINTMENTS',
        totalAppointments: locationAppointments.length,
        activeAppointments: activeAppointments.length
      });
    }
    
    await storage.deleteLocation(id);

    await logAdminAction(req, res, {
      resourceId: id,
      oldValue: captureEntitySnapshot(existingLocation),
      additionalInfo: 'Location deleted successfully'
    });

    cacheManager.invalidateLocationCaches(id);
    
    res.json({ message: "Location deleted successfully" });
  }));

  app.post("/api/upload/profile", imageUploadLimiter, requireAuth, profileUpload.single('profileImage'), asyncRoute("upload profile image", async (req: Request, res: Response) => {
    const user = req.user;
    
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const filename = `profile-${user!.id}-${Date.now()}`;
    const outputPath = path.join('public/uploads/profiles', filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {

      const validationResult = await ImageService.validateUploadedFile(
        inputPath,
        req.file.originalname,
        req.file.mimetype
      );
      
      if (!validationResult.isValid) {
        console.error(`[UPLOAD_SECURITY] Profile upload rejected: ${validationResult.error}`);
        return res.status(400).json({ 
          message: validationResult.error || "Invalid image file. Please upload a valid image."
        });
      }

      const jobId = ImageService.processProfileImageAsync(
        inputPath,
        outputPath,
        thumbnailPath,
        user!.id
      );

      const placeholderUrl = `/uploads/profiles/processing-placeholder.jpg`;
      
      res.json({ 
        processing: true,
        jobId,
        message: "Image upload successful, processing in background",
        imageUrl: placeholderUrl
      });
    } catch (error) {

      await ImageService.deleteImage(inputPath);
      console.error('Profile image upload error:', error);
      return res.status(500).json({
        message: 'Profile image upload failed. Please try again later.'
      });
    }
  }));

  app.post("/api/upload/car", imageUploadLimiter, requireAuth, carUpload.single('carImage'), asyncRoute("upload car image", async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const filename = `car-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const outputPath = path.join('public/uploads/cars', filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {

      const validationResult = await ImageService.validateUploadedFile(
        inputPath,
        req.file.originalname,
        req.file.mimetype
      );
      
      if (!validationResult.isValid) {
        console.error(`[UPLOAD_SECURITY] Car upload rejected: ${validationResult.error}`);
        return res.status(400).json({ 
          message: validationResult.error || "Invalid image file. Please upload a valid image."
        });
      }

      const jobId = ImageService.processCarImageAsync(
        inputPath,
        outputPath,
        thumbnailPath
      );

      const placeholderUrl = `/uploads/cars/processing-placeholder.jpg`;
      
      res.json({ 
        processing: true,
        jobId,
        message: "Image upload successful, processing in background",
        imageUrl: placeholderUrl,
        filename: filename
      });
    } catch (error) {

      await ImageService.deleteImage(inputPath);
      console.error('Car image upload error:', error);
      return res.status(500).json({
        message: 'Car image upload failed. Please try again later.'
      });
    }
  }));

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

  app.put("/api/upload/profile/replace/:filename", requireAuth, profileUpload.single('profileImage'), asyncRoute("replace profile image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const user = req.user;
    const storage = await getStorage();

    const currentUser = await storage.getUser(user!.id);
    if (!currentUser || !currentUser.profileImage) {
      return res.status(404).json({ message: "No profile image found to replace" });
    }

    const currentFilename = currentUser.profileImage.split('/').pop();
    if (currentFilename !== filename) {
      return res.status(403).json({ message: "Unauthorized: You can only replace your own profile image" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const newFilename = `profile-${user!.id}-${Date.now()}.jpg`;
    const outputPath = path.join('public/uploads/profiles', newFilename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${newFilename}`);

    try {

      const validationResult = await ImageService.validateUploadedFile(
        inputPath,
        req.file.originalname,
        req.file.mimetype
      );
      
      if (!validationResult.isValid) {
        console.error(`[UPLOAD_SECURITY] Profile replace rejected: ${validationResult.error}`);
        return res.status(400).json({ 
          message: validationResult.error || "Invalid image file. Please upload a valid image."
        });
      }

      await ImageService.processProfileImage(inputPath, outputPath);
      await ImageService.createThumbnail(outputPath, thumbnailPath);

      const oldImagePath = path.join('public/uploads/profiles', filename);
      await ImageService.deleteImageWithThumbnail(oldImagePath, 'profiles');

      const imageUrl = ImageService.generateImageUrl(newFilename, 'profiles');
      await storage.updateUser(user!.id, { profileImage: imageUrl });

      await ImageService.deleteImage(inputPath);

      res.json({ 
        message: "Profile image replaced successfully",
        imageUrl: imageUrl
      });
    } catch (error) {

      await ImageService.deleteImage(inputPath);
      await ImageService.deleteImage(outputPath);
      await ImageService.deleteImage(thumbnailPath);
      console.error('Profile image replace error:', error);
      return res.status(500).json({
        message: 'Profile image replacement failed. Please try again later.'
      });
    }
  }));

  app.put("/api/upload/car/replace/:filename", requireAdmin, carUpload.single('carImage'), asyncRoute("replace car image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const storage = await getStorage();

    const allCars = await storage.getAllCars();
    const carWithImage = allCars.find(car => {
      if (!car.image) return false;

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

      const validationResult = await ImageService.validateUploadedFile(
        inputPath,
        req.file.originalname,
        req.file.mimetype
      );
      
      if (!validationResult.isValid) {
        console.error(`[UPLOAD_SECURITY] Car replace rejected: ${validationResult.error}`);
        return res.status(400).json({ 
          message: validationResult.error || "Invalid image file. Please upload a valid image."
        });
      }

      await ImageService.processCarImage(inputPath, outputPath);
      await ImageService.createThumbnail(outputPath, thumbnailPath);

      const oldImagePath = path.join('public/uploads/cars', filename);
      await ImageService.deleteImageWithThumbnail(oldImagePath, 'cars');

      const imageUrl = ImageService.generateImageUrl(newFilename, 'cars');
      await storage.updateCar(carWithImage.id, { image: imageUrl });

      await logAdminAction(req, res, {
        resourceId: carWithImage.id,
        oldValue: { filename: filename, type: 'car' },
        newValue: { filename: newFilename, type: 'car' },
        additionalInfo: 'Car image replaced successfully'
      });

      await ImageService.deleteImage(inputPath);

      res.json({ 
        message: "Car image replaced successfully",
        imageUrl: imageUrl,
        carId: carWithImage.id
      });
    } catch (error) {

      await ImageService.deleteImage(inputPath);
      await ImageService.deleteImage(outputPath);
      await ImageService.deleteImage(thumbnailPath);
      console.error('Car image replace error:', error);
      return res.status(500).json({
        message: 'Car image replacement failed. Please try again later.'
      });
    }
  }));

  app.delete("/api/upload/profile/:filename", requireAuth, asyncRoute("delete profile image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const user = req.user;
    const storage = await getStorage();

    const currentUser = await storage.getUser(user!.id);
    if (!currentUser || !currentUser.profileImage) {
      return res.status(404).json({ message: "No profile image found to delete" });
    }

    const currentFilename = currentUser.profileImage.split('/').pop();
    if (currentFilename !== filename) {
      return res.status(403).json({ message: "Unauthorized: You can only delete your own profile image" });
    }

    try {

      const imagePath = path.join('public/uploads/profiles', filename);
      const deleteResult = await ImageService.deleteImageWithThumbnail(imagePath, 'profiles');

      await storage.updateUser(user!.id, { profileImage: null });

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

  app.delete("/api/upload/car/:filename", requireAdmin, asyncRoute("delete car image", async (req: Request, res: Response) => {
    const { filename } = req.params;
    const storage = await getStorage();

    const allCars = await storage.getAllCars();
    const carWithImage = allCars.find(car => {
      if (!car.image) return false;

      const carImageFilename = car.image.split('/').pop();
      return carImageFilename === filename;
    });
    
    if (!carWithImage) {
      return res.status(404).json({ message: "Car with specified image not found" });
    }

    try {

      const imagePath = path.join('public/uploads/cars', filename);
      const deleteResult = await ImageService.deleteImageWithThumbnail(imagePath, 'cars');

      await logAdminAction(req, res, {
        resourceId: carWithImage.id,
        oldValue: { filename: filename, type: 'car' },
        additionalInfo: 'Car image deleted successfully'
      });

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

  app.get("/api/upload/user/:userId/images", requireAuth, asyncRoute("get user images", async (req: Request, res: Response) => {
    const { userId } = req.params;
    const currentUser = req.user;
    const storage = await getStorage();

    if (!currentUser || (currentUser.role !== "admin" && currentUser.id !== userId)) {
      return res.status(403).json({ message: "Unauthorized: You can only access your own images" });
    }

    try {

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userImages = [];

      if (user.profileImage) {
        const filename = user.profileImage.split('/').pop();
        userImages.push({
          type: 'profile',
          filename: filename,
          url: user.profileImage,
          thumbnailUrl: `/uploads/thumbs/thumb-${filename}`,
          uploadedAt: user.createdAt
        });
      }

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

  app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

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

  app.delete("/api/appointments/:id", requireAuth, asyncRoute("delete appointment", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    const appointment = await storage.getAppointment(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

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

    if (user.role === "admin") {
      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: captureEntitySnapshot(appointment),
        additionalInfo: 'Appointment deleted successfully'
      });
    }

    res.status(204).send();
  }));

  app.put("/api/cars/:id", requireAdmin, asyncRoute("update car", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();

    const carResult = await getCachedCar(id);
    if (!carResult.success || !carResult.data) {
      return res.status(404).json({ message: "Car not found" });
    }
    const existingCar = carResult.data;

    const validatedData = insertCarSchema.partial().parse(req.body);

    const sanitizedData: any = { ...validatedData };
    if (validatedData.make) sanitizedData.make = sanitizeString(validatedData.make);
    if (validatedData.model) sanitizedData.model = sanitizeString(validatedData.model);
    if (validatedData.location) sanitizedData.location = sanitizeString(validatedData.location);
    if (validatedData.condition) sanitizedData.condition = sanitizeString(validatedData.condition);
    if (validatedData.image) sanitizedData.image = sanitizeUrl(validatedData.image);
    if (validatedData.description) sanitizedData.description = sanitizeMessage(validatedData.description);
    if (validatedData.transmission) sanitizedData.transmission = sanitizeString(validatedData.transmission);
    if (validatedData.bodyType) sanitizedData.bodyType = sanitizeString(validatedData.bodyType);
    if (validatedData.color) sanitizedData.color = sanitizeString(validatedData.color);
    if (validatedData.engineSize) sanitizedData.engineSize = sanitizeString(validatedData.engineSize);
    if (validatedData.features) sanitizedData.features = sanitizeMessage(validatedData.features);
    if (validatedData.fuelType) sanitizedData.fuelType = sanitizeString(validatedData.fuelType);
    
    const updatedCar = await storage.updateCar(id, sanitizedData);

    if (!updatedCar) {
      return res.status(500).json({ message: "Failed to update car" });
    }

    await logAdminAction(req, res, {
      resourceId: id,
      oldValue: captureEntitySnapshot(existingCar),
      newValue: captureEntitySnapshot(updatedCar),
      additionalInfo: 'Car updated successfully'
    });

    cacheManager.invalidateCarCaches(id);

    res.json(updatedCar);
  }));

  app.delete("/api/cars/:id", requireAdmin, asyncRoute("delete car", async (req: Request, res: Response) => {
    const { id } = req.params;
    const storage = await getStorage();

    const carResult = await getCachedCar(id);
    if (!carResult.success || !carResult.data) {
      return res.status(404).json({ message: "Car not found" });
    }
    const existingCar = carResult.data;

    const hasActiveBids = await storage.hasActiveBids(id);
    if (hasActiveBids) {
      return res.status(409).json({ 
        message: "Cannot delete car with active auction bids. Please wait for the auction to end or cancel the auction first." 
      });
    }

    try {

      const dbDeleteSuccess = await storage.deleteCar(id);
      if (!dbDeleteSuccess) {
        return res.status(500).json({ message: "Failed to delete car from database" });
      }

      if (existingCar.image) {
        const imageCleanupResult = await ImageService.deleteImagesForCar(id, existingCar.image);
        if (!imageCleanupResult.success) {
          console.error(`Image cleanup failed after car deletion for car ${id}:`, imageCleanupResult.errors);

          console.warn(`Car ${id} deleted from database but images may remain. Manual cleanup may be required.`);
        } else {
        }
      }

      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: captureEntitySnapshot(existingCar),
        additionalInfo: 'Car deleted successfully'
      });

      cacheManager.invalidateCarCaches(id);

      res.status(204).send();
    } catch (error) {

      throw error;
    }
  }));

  app.get("/api/customers/:id", requireAuth, asyncRoute("get customer by ID", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    const customer = await storage.getCustomer(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (user.role !== "admin" && customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only access your own customer information" 
      });
    }

    res.json(customer);
  }));

  app.put("/api/customers/:id", requireAuth, asyncRoute("update customer", async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    const existingCustomer = await storage.getCustomer(id);
    if (!existingCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (existingCustomer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only update your own customer information" 
      });
    }

    const validatedData = insertCustomerSchema.omit({ userId: true }).partial().parse(req.body);

    const sanitizedData: any = { ...validatedData };
    if (validatedData.name) sanitizedData.name = sanitizeUsername(validatedData.name);
    if (validatedData.email) sanitizedData.email = sanitizeEmail(validatedData.email);
    if (validatedData.phone) sanitizedData.phone = sanitizePhone(validatedData.phone);
    if (validatedData.countryCode) sanitizedData.countryCode = sanitizeString(validatedData.countryCode);

    const updatedCustomer = await storage.updateCustomer(id, sanitizedData);

    if (!updatedCustomer) {
      return res.status(500).json({ message: "Failed to update customer" });
    }

    res.json(updatedCustomer);
  }));

  app.get("/api/health", async (req, res) => {
    try {

      const storage = await getStorage();
      await storage.getAllServices();
      res.json({ status: "ok", message: "Storage connected successfully" });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Storage connection failed" });
    }
  });

  app.post("/api/webhooks/whatsapp", webhookLimiter, async (req: Request, res: Response) => {
    try {
      const signature = req.get('X-Twilio-Signature');
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

      if (process.env.TWILIO_AUTH_TOKEN) {
        if (!signature) {
          console.error('[WhatsApp Webhook] Missing signature header');
          return res.status(403).json({ message: 'Webhook signature required' });
        }

        const rawBody = JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
          .update(url + rawBody)
          .digest('base64');
        
        const providedSignature = signature.replace('sha1=', '');

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
        
      } else {
        console.warn('[WhatsApp Webhook] TWILIO_AUTH_TOKEN not configured - skipping signature verification');
      }
      
      const { MessageSid, MessageStatus, From, To, ErrorCode, ErrorMessage } = req.body;
      
      if (!MessageSid || !MessageStatus) {
        console.error('[WhatsApp Webhook] Missing required fields:', { MessageSid, MessageStatus });
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
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

        res.status(200).send('OK');
      } else {
        console.warn(`[WhatsApp Webhook] Message ${MessageSid} not found in database`);

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

      const isTransientError = err.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
      const isDatabaseError = err.code && err.code.startsWith('2');
      
      if (isTransientError) {
        console.warn(`[WhatsApp Webhook] Transient error detected: ${err.code} - returning 503 for retry`);

        return res.status(503).json({ 
          message: 'Service temporarily unavailable', 
          retryAfter: 60
        });
      }
      
      if (isDatabaseError) {
        console.error(`[WhatsApp Webhook] Database error: ${err.code} - ${err.message}`);

        return res.status(503).json({ 
          message: 'Database temporarily unavailable',
          retryAfter: 120
        });
      }

      res.status(200).send('Error logged - no retry needed');
    }
  });

  app.get("/api/admin/whatsapp/messages", requireAdmin, asyncRoute("get whatsapp messages", async (req: Request, res: Response) => {
    const storage = await getStorage();
    const { page = 1, limit = 50, status } = req.query;
    
    try {
      const messages = await storage.getWhatsAppMessages({
        page: parseInt(String(page)),
        limit: parseInt(String(limit)),
        status: typeof status === 'string' ? status : undefined
      });
      
      res.json(messages);
    } catch (error) {
      handleApiError(error, "fetch WhatsApp messages", res);
    }
  }));

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

  app.get("/api/admin/contacts", 
    createEnhancedAdminMiddleware({
      action: "read", 
      resource: "contact",
      rateLimit: 100,
      validateInput: (req) => {
        const { page, limit, status, startDate, endDate } = req.query;
        
        if (page && (isNaN(Number(page)) || Number(page) < 1)) {
          return "Page must be a positive number";
        }
        if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
          return "Limit must be between 1 and 100";
        }
        if (status && !["new", "responded", "resolved"].includes(status as string)) {
          return "Status must be one of: new, responded, resolved";
        }
        if (startDate && isNaN(Date.parse(startDate as string))) {
          return "Invalid start date format";
        }
        if (endDate && isNaN(Date.parse(endDate as string))) {
          return "Invalid end date format";
        }
        return null;
      }
    }),
    asyncRoute("get admin contacts", withStorage(async (storage, req: Request, res: Response) => {
      const startTime = Date.now();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const search = req.query.search as string;

      const result = await storage.getContactsWithFilter({ 
        page, 
        limit, 
        status,
        startDate,
        endDate,
        search
      });

      const duration = Date.now() - startTime;
      console.log(`[PERF] GET /api/admin/contacts completed in ${duration}ms`);
      if (duration > 500) {
        console.warn(`[SLOW_REQUEST] GET /api/admin/contacts 200 in ${duration}ms`);
      }

      await logAdminAction(req, res, {
        additionalInfo: `Viewed contacts page ${page}, filters: ${JSON.stringify({ status, startDate, endDate, search })}`
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
      action: "update",
      resource: "contact", 
      rateLimit: 50,
      validateInput: (req) => {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        if (!id || typeof id !== 'string') {
          return "Contact ID is required and must be a string";
        }
        if (status && !["new", "responded", "resolved"].includes(status)) {
          return "Status must be one of: new, responded, resolved";
        }
        if (notes !== undefined && typeof notes !== 'string') {
          return "Notes must be a string";
        }
        if (!status && notes === undefined) {
          return "Either status or notes must be provided";
        }
        return null;
      }
    }),
    asyncRoute("update contact", withStorage(async (storage, req: Request, res: Response) => {
      const { id } = req.params;

      const validatedData = updateContactSchema.parse(req.body);

      const existingContacts = await storage.getAllContacts();
      const existingContact = existingContacts.find(c => c.id === id);
      
      if (!existingContact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const updatedContact = await storage.updateContact(id, validatedData);
      
      if (!updatedContact) {
        return res.status(404).json({ message: "Contact not found" });
      }

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

  app.delete("/api/admin/contacts/:id",
    createEnhancedAdminMiddleware({
      action: "delete",
      resource: "contact",
      rateLimit: 30,
      validateInput: (req) => {
        const { id } = req.params;
        if (!id || typeof id !== 'string') {
          return "Contact ID is required and must be a string";
        }
        return null;
      }
    }),
    asyncRoute("delete contact", withStorage(async (storage, req: Request, res: Response) => {
      const { id } = req.params;

      const existingContacts = await storage.getAllContacts();
      const existingContact = existingContacts.find(c => c.id === id);

      if (!existingContact) {
        return sendNotFoundError(res, "Contact not found");
      }

      const deleted = await storage.deleteContact(id);

      if (!deleted) {
        return sendError(res, "Failed to delete contact");
      }

      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: existingContact,
        additionalInfo: `Deleted contact from ${existingContact.name} (${existingContact.email})`
      });

      sendResourceDeleted(res, "Contact deleted successfully");
    }))
  );

  app.post("/api/admin/contacts/bulk-delete",
    createEnhancedAdminMiddleware({
      action: "bulk_delete",
      resource: "contact",
      rateLimit: 20,
      validateInput: (req) => {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
          return "ids must be an array";
        }
        if (ids.length === 0) {
          return "ids array cannot be empty";
        }
        if (ids.length > 100) {
          return "Cannot delete more than 100 contacts at once";
        }
        if (!ids.every(id => typeof id === 'string')) {
          return "All ids must be strings";
        }
        return null;
      }
    }),
    asyncRoute("bulk delete contacts", withStorage(async (storage, req: Request, res: Response) => {
      const { ids } = req.body;

      const deletedCount = await storage.deleteContacts(ids);

      await logAdminAction(req, res, {
        additionalInfo: `Bulk deleted ${deletedCount} contact(s). IDs: ${ids.join(', ')}`
      });

      res.json({
        message: `Successfully deleted ${deletedCount} contact(s)`,
        deletedCount
      });
    }))
  );

  app.post("/api/admin/contacts/export",
    createEnhancedAdminMiddleware({
      action: "export",
      resource: "contact",
      rateLimit: 10,
      validateInput: (req) => {
        const { status, startDate, endDate } = req.body;
        
        if (status && !["new", "responded", "resolved"].includes(status)) {
          return "Status must be one of: new, responded, resolved";
        }
        if (startDate && isNaN(Date.parse(startDate))) {
          return "Invalid start date format";
        }
        if (endDate && isNaN(Date.parse(endDate))) {
          return "Invalid end date format";
        }
        return null;
      }
    }),
    asyncRoute("export contacts to CSV", withStorage(async (storage, req: Request, res: Response) => {
      const { status, startDate, endDate, search } = req.body;

      const contactsToExport = await storage.getContactsForExport({
        status,
        startDate,
        endDate,
        search
      });

      const escapeCSV = (field: string | null | undefined): string => {
        if (field === null || field === undefined) return '';
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      };

      const formatDate = (date: Date | string): string => {
        const d = new Date(date);
        return d.toISOString();
      };

      const csvHeader = 'Name,Email,Phone,Subject,Message,Status,Created At,Notes,Notes Updated At\n';
      
      const csvRows = contactsToExport.map(contact => {
        return [
          escapeCSV(contact.name),
          escapeCSV(contact.email),
          escapeCSV(contact.phone),
          escapeCSV(contact.subject),
          escapeCSV(contact.message),
          escapeCSV(contact.status),
          escapeCSV(formatDate(contact.createdAt)),
          escapeCSV(contact.notes),
          contact.notesUpdatedAt ? escapeCSV(formatDate(contact.notesUpdatedAt)) : ''
        ].join(',');
      }).join('\n');

      const csv = csvHeader + csvRows;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `contacts-export-${timestamp}.csv`;

      await logAdminAction(req, res, {
        additionalInfo: `Exported ${contactsToExport.length} contacts with filters: ${JSON.stringify({ status, startDate, endDate, search })}`
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    }))
  );

  app.get("/api/admin/audit-logs", 
    createEnhancedAdminMiddleware({
      action: "read", 
      resource: "audit_log",
      rateLimit: 100,
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

      await logAdminAction(req, res, {
        additionalInfo: `Viewed audit logs - adminUserId: ${adminUserId || 'all'}, limit: ${limit}, offset: ${offset}`
      });

      res.json({
        auditLogs,
        pagination: {
          limit,
          offset,
          hasMore: auditLogs.length === limit,
          total: await storage.getAdminAuditLogsCount(adminUserId)
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
      rateLimit: 100,
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

      const validImageTypes = ['logo', 'banner', 'icon', 'gallery', 'service', 'testimonial', 'general'];
      if (!imageType || !validImageTypes.includes(imageType)) {
        return sendValidationError(res, `Image type must be one of: ${validImageTypes.join(', ')}`, []);
      }

      const sanitizedAltText = altText ? sanitizeString(altText) : null;
      const sanitizedCaption = caption ? sanitizeMessage(caption) : null;
      const sanitizedTags = tags ? sanitizeString(tags) : null;

      try {
        const storage = await getStorage();
        const uploadedBy = req.user!.id;

        const validationResult = await ImageService.validateUploadedFile(
          req.file.path,
          req.file.originalname,
          req.file.mimetype
        );
        
        if (!validationResult.isValid) {
          console.error(`[UPLOAD_SECURITY] Media library upload rejected: ${validationResult.error}`);
          return sendValidationError(res, validationResult.error || "Invalid image file or dimensions", []);
        }

        const ext = path.extname(req.file.filename).toLowerCase();
        let fileUrl = `/uploads/profiles/${req.file.filename}`;
        let width, height;
        
        if (ext !== '.svg') {
          const metadata = await sharp(req.file.path).metadata();
          width = metadata.width;
          height = metadata.height;
        }

        const mediaImage = await storage.createMediaLibraryImage({
          fileName: req.file.filename,
          fileUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          imageType,
          altText: sanitizedAltText,
          caption: sanitizedCaption,
          width: width || null,
          height: height || null,
          uploadedBy,
          tags: sanitizedTags,
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

  function isValidPhone(phone: string | null | undefined, countryCode: string | null | undefined): boolean {
    if (!phone || !countryCode) {
      return false;
    }
    
    const sanitizedPhone = sanitizePhone(phone);
    const sanitizedCountryCode = countryCode.replace(/\D/g, '');

    if (!sanitizedPhone || sanitizedPhone.length < 8 || sanitizedPhone.length > 15) {
      return false;
    }

    if (!sanitizedCountryCode || sanitizedCountryCode.length < 1 || sanitizedCountryCode.length > 3) {
      return false;
    }
    
    return true;
  }
  
  function isValidEmail(email: string | null | undefined): boolean {
    if (!email) {
      return false;
    }
    
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return false;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(sanitizedEmail);
  }
  
  function hasRequiredContactInfo(
    recipient: { email?: string; phone?: string; countryCode?: string; userId?: string },
    channel: string
  ): { valid: boolean; missingInfo?: string } {
    if (channel === 'whatsapp' || channel === 'both') {
      if (!isValidPhone(recipient.phone, recipient.countryCode)) {
        return { valid: false, missingInfo: 'whatsapp' };
      }
    }
    
    if (channel === 'email' || channel === 'both') {
      if (!isValidEmail(recipient.email)) {
        return { valid: false, missingInfo: 'email' };
      }
    }
    
    return { valid: true };
  }

  app.post("/api/admin/promotions/whatsapp",
    requireAdmin,
    asyncRoute("send promotional whatsapp message", async (req: Request, res: Response) => {
      const { phone, countryCode, message, customerName } = req.body;
      
      if (!phone || !countryCode || !message) {
        return sendValidationError(res, "Phone, country code, and message are required", []);
      }

      const sanitizedPhone = sanitizePhone(phone);
      const sanitizedCountryCode = countryCode.replace(/\D/g, '');
      const sanitizedMessage = sanitizeMessage(message);
      const sanitizedName = customerName ? sanitizeUsername(customerName) : 'Customer';

      if (!isValidPhone(phone, countryCode)) {
        return sendValidationError(res, "Invalid phone number or country code. Phone must be 8-15 digits and country code must be 1-3 digits.", [
          "Please ensure the phone number and country code are properly formatted"
        ]);
      }

      const formattedNumber = `whatsapp:+${sanitizedCountryCode}${sanitizedPhone}`;

      console.log(`[ADMIN] Sending promotional WhatsApp to ${formattedNumber}`);
      
      const result = await WhatsAppService.sendMessage(
        formattedNumber,
        sanitizedMessage,
        'welcome_message',
        undefined
      );
      
      if (result.success) {
        await logAdminAction(req, res, {
          additionalInfo: `Sent promotional WhatsApp to ${sanitizedCountryCode}${sanitizedPhone}`
        });
        
        console.log(`[ADMIN] WhatsApp sent successfully: ${result.messageSid}`);
        return sendSuccess(res, {
          messageSid: result.messageSid,
          status: result.message,
          sentTo: formattedNumber
        }, "Promotional WhatsApp sent successfully");
      } else {
        console.error(`[ADMIN] WhatsApp send failed: ${result.message}`);
        
        // Provide helpful error messages for common issues
        let userMessage = result.message || "Failed to send promotional WhatsApp";
        let suggestions: string[] = [];
        
        if (result.message?.includes('63007') || result.message?.includes('Channel')) {
          userMessage = "WhatsApp sender number is not configured in Twilio";
          suggestions = [
            "The WhatsApp sender number needs to be enabled in your Twilio account",
            "Please visit Twilio Console to enable WhatsApp for your number",
            "Alternatively, you can use the Twilio WhatsApp Sandbox for testing"
          ];
        } else if (result.message?.includes('21211')) {
          userMessage = "Invalid recipient phone number format";
          suggestions = ["Please ensure the phone number is in the correct format"];
        } else if (result.message?.includes('21608')) {
          userMessage = "The recipient does not have an active WhatsApp account";
          suggestions = ["Please verify the phone number has WhatsApp installed"];
        }
        
        return sendError(res, userMessage, 500, suggestions.length > 0 ? suggestions : undefined);
      }
    })
  );

  app.post("/api/admin/promotions/email",
    requireAdmin,
    asyncRoute("send promotional email", async (req: Request, res: Response) => {
      const { email, subject, message, customerName } = req.body;
      
      if (!email || !subject || !message) {
        return sendValidationError(res, "Email, subject, and message are required", []);
      }
      
      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedSubject = sanitizeString(subject);
      const sanitizedMessage = sanitizeMessage(message);
      const sanitizedName = customerName ? sanitizeUsername(customerName) : 'Customer';

      if (!isValidEmail(email)) {
        return sendValidationError(res, "Invalid email address. Please provide a valid email in the format: name@example.com", [
          "Email must be a valid format (e.g., user@domain.com)"
        ]);
      }

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">Ronak Motor Garage</h1>
            </div>
            
            <h2 style="color: #2c3e50; margin-bottom: 20px;">Hello ${sanitizedName}!</h2>
            
            <div style="color: #495057; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              ${sanitizedMessage.replace(/\n/g, '<br>')}
            </div>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
              <p style="color: #6c757d; font-size: 14px; margin: 0;">
                Ronak Motor Garage - Your Trusted Automotive Partner
              </p>
            </div>
          </div>
        </div>
      `;
      
      const text = `Hello ${sanitizedName}!\n\n${sanitizedMessage}\n\n---\nRonak Motor Garage - Your Trusted Automotive Partner`;

      const result = await sendEmail({
        to: sanitizedEmail,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
        subject: sanitizedSubject,
        html,
        text
      });
      
      if (result) {
        await logAdminAction(req, res, {
          additionalInfo: `Sent promotional email to ${sanitizedEmail}`
        });
        
        return sendSuccess(res, {
          recipient: sanitizedEmail,
          subject: sanitizedSubject
        }, "Promotional email sent successfully");
      } else {
        return sendError(res, "Failed to send promotional email", 500);
      }
    })
  );

  app.post("/api/admin/promotions/bulk",
    requireAdmin,
    asyncRoute("send bulk promotional messages", async (req: Request, res: Response) => {
      const { userType, message, subject, channel } = req.body;
      
      if (!message) {
        return sendValidationError(res, "Message is required", []);
      }

      if (!channel || !['whatsapp', 'email', 'both'].includes(channel)) {
        return sendValidationError(res, "Channel must be 'whatsapp', 'email', or 'both'", []);
      }

      if (!userType || !['all', 'customers'].includes(userType)) {
        return sendValidationError(res, "UserType must be 'all' or 'customers'", []);
      }
      
      const storage = await getStorage();
      let recipients: any[] = [];
      
      if (userType === 'all') {
        recipients = await storage.getAllUsers();
      } else if (userType === 'customers') {
        const allUsers = await storage.getAllUsers();
        recipients = allUsers.filter(u => u.role === 'customer');
      }

      if (recipients.length === 0) {
        return sendValidationError(res, "No users found matching the criteria", []);
      }
      
      const sanitizedMessage = sanitizeMessage(message);
      const sanitizedSubject = subject ? sanitizeString(subject) : 'Special Promotion from Ronak Motor Garage';
      
      const results = {
        total: recipients.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        errors: [] as string[]
      };
      
      for (const recipient of recipients) {
        try {
          const validation = hasRequiredContactInfo(recipient, channel);
          if (!validation.valid) {
            results.skipped++;
            const recipientIdentifier = recipient.email || recipient.phone || recipient.id || 'Unknown';
            results.errors.push(`${recipientIdentifier}: Missing required contact info for ${validation.missingInfo}`);
            continue;
          }

          if (channel === 'whatsapp' || channel === 'both') {
            if (recipient.phone && recipient.countryCode) {

              const sanitizedPhone = sanitizePhone(recipient.phone);
              const sanitizedCountryCode = recipient.countryCode.replace(/\D/g, '');

              if (sanitizedPhone && sanitizedPhone.length >= 8 && sanitizedPhone.length <= 15) {
                const formattedNumber = `whatsapp:+${sanitizedCountryCode}${sanitizedPhone}`;
                const result = await WhatsAppService.sendMessage(
                  formattedNumber,
                  sanitizedMessage,
                  'welcome_message',
                  undefined
                );
                
                if (result.success) {
                  results.sent++;
                } else {
                  results.failed++;
                  results.errors.push(`WhatsApp to ${sanitizedPhone}: ${result.message}`);
                }
              } else {
                results.failed++;
                results.errors.push(`WhatsApp to ${recipient.phone}: Invalid phone number format after sanitization`);
              }
            }
          }
          
          if (channel === 'email' || channel === 'both') {
            if (recipient.email) {
              const sanitizedEmail = sanitizeEmail(recipient.email);
              if (sanitizedEmail) {
                const customerName = recipient.name ? sanitizeUsername(recipient.name) : 'Customer';
                const html = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
                    <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">Ronak Motor Garage</h1>
                      </div>
                      
                      <h2 style="color: #2c3e50; margin-bottom: 20px;">Hello ${customerName}!</h2>
                      
                      <div style="color: #495057; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                        ${sanitizedMessage.replace(/\n/g, '<br>')}
                      </div>
                      
                      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center;">
                        <p style="color: #6c757d; font-size: 14px; margin: 0;">
                          Ronak Motor Garage - Your Trusted Automotive Partner
                        </p>
                      </div>
                    </div>
                  </div>
                `;
                
                const result = await sendEmail({
                  to: sanitizedEmail,
                  from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
                  subject: sanitizedSubject,
                  html,
                  text: `Hello ${customerName}!\n\n${sanitizedMessage}\n\n---\nRonak Motor Garage - Your Trusted Automotive Partner`
                });
                
                if (result) {
                  results.sent++;
                } else {
                  results.failed++;
                  results.errors.push(`Email to ${sanitizedEmail}: Failed to send`);
                }
              } else {
                results.failed++;
                results.errors.push(`Email to ${recipient.email}: Invalid email format after sanitization`);
              }
            }
          }
        } catch (error) {
          results.failed++;
          const err = error as Error;
          results.errors.push(`${recipient.email || recipient.phone || recipient.userId}: ${err.message}`);
        }
      }
      
      await logAdminAction(req, res, {
        additionalInfo: `Sent bulk promotions via ${channel}: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`
      });
      
      return sendSuccess(res, results, `Bulk promotional messages processed: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`);
    })
  );

  // Invoice API Routes
  app.get("/api/admin/invoices",
    requireAdmin,
    asyncRoute("get all invoices", async (req: Request, res: Response) => {
      const { page = "1", limit = "20", status, customerEmail, startDate, endDate } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as string;
      if (customerEmail) filters.customerEmail = customerEmail as string;
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
      
      filters.page = parseInt(page as string);
      filters.limit = parseInt(limit as string);
      
      const storage = await getStorage();
      const result = await storage.getInvoices(filters);
      
      return sendPaginatedResponse(
        res,
        result.invoices,
        (filters.page - 1) * filters.limit,
        filters.limit,
        result.total,
        "Invoices retrieved successfully"
      );
    })
  );

  app.get("/api/admin/invoices/eligible-transactions",
    requireAdmin,
    asyncRoute("get eligible transactions for invoicing", async (req: Request, res: Response) => {
      const storage = await getStorage();
      const transactions = await storage.getEligibleTransactionsForInvoicing();
      
      return sendSuccess(res, transactions, "Eligible transactions retrieved successfully");
    })
  );

  app.get("/api/admin/invoices/:id",
    requireAdmin,
    asyncRoute("get invoice by id", async (req: Request, res: Response) => {
      const { id } = req.params;
      const storage = await getStorage();
      const invoice = await storage.getInvoiceById(id);
      
      if (!invoice) {
        return sendNotFoundError(res, "Invoice not found");
      }
      
      return sendSuccess(res, invoice, "Invoice retrieved successfully");
    })
  );

  app.post("/api/admin/invoices",
    requireAdmin,
    asyncRoute("create invoice", async (req: Request, res: Response) => {
      const invoiceInput = {
        ...req.body.invoice,
        invoiceNumber: req.body.invoice?.invoiceNumber || invoiceService.generateInvoiceNumber()
      };
      
      const validationResult = insertInvoiceSchema.safeParse(invoiceInput);
      
      if (!validationResult.success) {
        const errorMessage = fromZodError(validationResult.error).toString();
        return sendValidationError(res, "Invalid invoice data", [errorMessage]);
      }

      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return sendValidationError(res, "Invoice must have at least one item", []);
      }

      const storage = await getStorage();
      const invoice = await storage.createInvoice(validationResult.data, items);
      
      if (invoice.customerPhone) {
        try {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
            : 'http://localhost:5000';
          const invoiceUrl = `${baseUrl}/invoices/${invoice.id}`;
          
          const { extractCountryCode } = await import('@shared/phone-utils');
          const cleanPhone = invoice.customerPhone.replace(/\D/g, '');
          const countryCode = extractCountryCode(cleanPhone);
          
          const { WhatsAppService } = await import('./whatsapp-service');
          await WhatsAppService.sendInvoiceNotification(
            invoice.customerPhone,
            `+${countryCode}`,
            invoice.customerName,
            invoice.invoiceNumber,
            invoice.totalAmount,
            invoiceUrl,
            invoice.customerEmail || undefined
          );
          console.log(`[Invoice] WhatsApp notification sent to ${invoice.customerPhone}`);
        } catch (whatsappError) {
          console.error(`[Invoice] Failed to send WhatsApp notification:`, whatsappError);
        }
      }
      
      await logAdminAction(req, res, {
        resourceId: invoice.id,
        newValue: { invoiceNumber: invoice.invoiceNumber, customerEmail: invoice.customerEmail },
        additionalInfo: `Created invoice ${invoice.invoiceNumber} for ${invoice.customerName}`
      });
      
      return sendResourceCreated(res, invoice, "Invoice created successfully");
    })
  );

  app.patch("/api/admin/invoices/:id",
    requireAdmin,
    asyncRoute("update invoice", async (req: Request, res: Response) => {
      const { id } = req.params;
      const storage = await getStorage();
      
      const existingInvoice = await storage.getInvoiceById(id);
      if (!existingInvoice) {
        return sendNotFoundError(res, "Invoice not found");
      }

      const updates = req.body;
      const updatedInvoice = await storage.updateInvoice(id, updates);
      
      if (!updatedInvoice) {
        return sendError(res, "Failed to update invoice", 500);
      }

      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: { status: existingInvoice.status },
        newValue: { status: updatedInvoice.status },
        additionalInfo: `Updated invoice ${updatedInvoice.invoiceNumber}`
      });
      
      return sendResourceUpdated(res, updatedInvoice, "Invoice updated successfully");
    })
  );

  app.delete("/api/admin/invoices/:id",
    requireAdmin,
    asyncRoute("delete invoice", async (req: Request, res: Response) => {
      const { id } = req.params;
      const storage = await getStorage();
      
      const invoice = await storage.getInvoiceById(id);
      if (!invoice) {
        return sendNotFoundError(res, "Invoice not found");
      }

      const deleted = await storage.deleteInvoice(id);
      
      if (!deleted) {
        return sendError(res, "Failed to delete invoice", 500);
      }

      await logAdminAction(req, res, {
        resourceId: id,
        oldValue: { invoiceNumber: invoice.invoiceNumber },
        additionalInfo: `Deleted invoice ${invoice.invoiceNumber}`
      });
      
      return sendResourceDeleted(res, "Invoice deleted successfully");
    })
  );

  app.post("/api/admin/invoices/:id/send",
    requireAdmin,
    asyncRoute("send invoice via email", async (req: Request, res: Response) => {
      const { id } = req.params;
      const storage = await getStorage();
      
      const invoice = await storage.getInvoiceById(id);
      if (!invoice) {
        return sendNotFoundError(res, "Invoice not found");
      }

      if (!invoice.customerEmail) {
        return sendValidationError(res, "Invoice does not have a customer email", []);
      }

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 40px;">
            <h1 style="color: #2c3e50; margin-bottom: 30px;">Invoice ${invoice.invoiceNumber}</h1>
            
            <div style="background-color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #2c3e50; margin-bottom: 20px;">Bill To:</h2>
              <p><strong>${invoice.customerName}</strong></p>
              ${invoice.customerAddress ? `<p>${invoice.customerAddress}</p>` : ''}
              ${invoice.customerCity ? `<p>${invoice.customerCity}, ${invoice.customerState} ${invoice.customerZipCode || ''}</p>` : ''}
              ${invoice.customerGSTIN ? `<p>GSTIN: ${invoice.customerGSTIN}</p>` : ''}
            </div>

            <div style="background-color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #2c3e50; margin-bottom: 20px;">Invoice Details:</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Item</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Qty</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Rate</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${invoice.items.map(item => `
                    <tr>
                      <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${item.description}</td>
                      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #dee2e6;">${item.quantity}</td>
                      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #dee2e6;">₹${item.unitPrice}</td>
                      <td style="padding: 12px; text-align: right; border-bottom: 1px solid #dee2e6;">₹${item.amount}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div style="margin-top: 20px; text-align: right;">
                <p><strong>Subtotal:</strong> ₹${invoice.subtotal}</p>
                ${parseFloat(invoice.cgstAmount) > 0 ? `<p><strong>CGST:</strong> ₹${invoice.cgstAmount}</p>` : ''}
                ${parseFloat(invoice.sgstAmount) > 0 ? `<p><strong>SGST:</strong> ₹${invoice.sgstAmount}</p>` : ''}
                ${parseFloat(invoice.igstAmount) > 0 ? `<p><strong>IGST:</strong> ₹${invoice.igstAmount}</p>` : ''}
                <p style="font-size: 20px; color: #2c3e50; margin-top: 10px;"><strong>Total:</strong> ₹${invoice.totalAmount}</p>
              </div>
            </div>

            ${invoice.notes ? `
              <div style="background-color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #2c3e50; margin-bottom: 10px;">Notes:</h3>
                <p>${invoice.notes}</p>
              </div>
            ` : ''}

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d;">
                ${invoice.businessName}<br>
                ${invoice.businessAddress ? invoice.businessAddress + '<br>' : ''}
                ${invoice.businessGSTIN ? 'GSTIN: ' + invoice.businessGSTIN : ''}
              </p>
            </div>
          </div>
        </div>
      `;

      const result = await sendEmail({
        to: invoice.customerEmail,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
        subject: `Invoice ${invoice.invoiceNumber} from ${invoice.businessName}`,
        html: emailHtml,
        text: `Invoice ${invoice.invoiceNumber}\n\nCustomer: ${invoice.customerName}\nTotal: ₹${invoice.totalAmount}\n\nPlease view the full invoice in your email client that supports HTML.`
      });

      if (result) {
        await logAdminAction(req, res, {
          resourceId: id,
          additionalInfo: `Sent invoice ${invoice.invoiceNumber} to ${invoice.customerEmail}`
        });
        
        return sendSuccess(res, { sent: true }, "Invoice sent successfully");
      } else {
        return sendError(res, "Failed to send invoice email", 500);
      }
    })
  );

  const httpServer = createServer(app);

  return httpServer;
}
