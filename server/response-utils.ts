import type { Response } from "express";

// Standardized API response interfaces
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: string[];
  code?: string;
  meta?: Record<string, any>;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Success response utility functions
export function createSuccessResponse<T>(
  data: T, 
  message?: string
): ApiSuccessResponse<T> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

export function createErrorResponse(
  message: string,
  errors?: string[],
  code?: string,
  meta?: Record<string, any>
): ApiErrorResponse {
  const response: ApiErrorResponse = {
    success: false,
    message
  };
  
  if (errors && errors.length > 0) {
    response.errors = errors;
  }
  
  if (code) {
    response.code = code;
  }
  
  if (meta) {
    response.meta = meta;
  }
  
  return response;
}

// Express response helper functions
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response {
  return res.status(statusCode).json(createSuccessResponse(data, message));
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  errors?: string[],
  code?: string,
  meta?: Record<string, any>
): Response {
  return res.status(statusCode).json(createErrorResponse(message, errors, code, meta));
}

// Specialized success response helpers for common patterns
export function sendResourceCreated<T>(
  res: Response,
  data: T,
  message?: string
): Response {
  return sendSuccess(res, data, message || "Resource created successfully", 201);
}

export function sendResourceUpdated<T>(
  res: Response,
  data: T,
  message?: string
): Response {
  return sendSuccess(res, data, message || "Resource updated successfully");
}

export function sendResourceDeleted(
  res: Response,
  message?: string
): Response {
  return sendSuccess(res, null, message || "Resource deleted successfully");
}

// Collection response helper with pagination metadata
export interface PaginatedData<T> {
  items: T[];
  pagination: {
    offset: number;
    limit: number;
    total?: number;
    hasMore: boolean;
  };
}

export function sendPaginatedResponse<T>(
  res: Response,
  items: T[],
  offset: number,
  limit: number,
  total?: number,
  message?: string
): Response {
  const data: PaginatedData<T> = {
    items,
    pagination: {
      offset,
      limit,
      total,
      hasMore: items.length === limit
    }
  };
  
  return sendSuccess(res, data, message);
}

// Specialized error response helpers
export function sendValidationError(
  res: Response,
  message: string = "Validation failed",
  errors?: string[]
): Response {
  return sendError(res, message, 400, errors, "VALIDATION_ERROR");
}

export function sendNotFoundError(
  res: Response,
  resource: string = "Resource"
): Response {
  return sendError(res, `${resource} not found`, 404, undefined, "NOT_FOUND");
}

export function sendUnauthorizedError(
  res: Response,
  message: string = "Authentication required"
): Response {
  return sendError(res, message, 401, undefined, "UNAUTHORIZED");
}

export function sendForbiddenError(
  res: Response,
  message: string = "Access forbidden"
): Response {
  return sendError(res, message, 403, undefined, "FORBIDDEN");
}

export function sendConflictError(
  res: Response,
  message: string = "Resource already exists"
): Response {
  return sendError(res, message, 409, undefined, "CONFLICT");
}

export function sendRateLimitError(
  res: Response,
  retryAfter?: number
): Response {
  const response = sendError(
    res, 
    "Rate limit exceeded. Please try again later.", 
    429, 
    undefined, 
    "RATE_LIMIT_EXCEEDED"
  );
  
  if (retryAfter) {
    res.set('Retry-After', retryAfter.toString());
  }
  
  return response;
}

// Database error handling with standardized responses
export function sendDatabaseError(
  res: Response,
  operation: string,
  error: unknown
): Response {
  console.error(`Database error during ${operation}:`, error);
  
  // Handle specific PostgreSQL error codes
  const dbError = error as { code?: string };
  switch (dbError?.code) {
    case '23505': // Unique constraint violation
      return sendConflictError(res, `This ${operation} conflicts with existing data. Please check for duplicates.`);
      
    case '23503': // Foreign key constraint violation
      return sendValidationError(res, `Invalid reference in ${operation}. Referenced data does not exist.`);
      
    case '23502': // Not null constraint violation
      return sendValidationError(res, `Missing required field in ${operation}. All required fields must be provided.`);
      
    case '22001': // String data too long
      return sendValidationError(res, `Data too long for ${operation}. Please reduce the length of your input.`);
      
    default:
      return sendError(res, `Database error occurred during ${operation}. Please try again later.`);
  }
}