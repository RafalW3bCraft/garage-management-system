import type { Response } from "express";

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

export function sendDatabaseError(
  res: Response,
  operation: string,
  error: unknown
): Response {
  console.error(`Database error during ${operation}:`, error);

  const dbError = error as { code?: string; constraint?: string; detail?: string; table?: string; column?: string };
  
  switch (dbError?.code) {
    case '23505':
      return sendConflictError(res, `This ${operation} conflicts with existing data. Please check for duplicates.`);
      
    case '23503': {
      
      let errorMessage = `Invalid reference in ${operation}.`;
      const errors: string[] = [];
      
      
      if (dbError.detail) {
        
        const match = dbError.detail.match(/Key \((\w+)\)=\(([^)]+)\) is not present in table "(\w+)"/);
        if (match) {
          const [, field, value, table] = match;
          const fieldName = field.replace(/_/g, ' ');
          const tableName = table.replace(/_/g, ' ');
          errorMessage = `Invalid ${fieldName} selected`;
          errors.push(`The selected ${fieldName} (ID: ${value}) does not exist in ${tableName}. Please select a valid option.`);
        } else {
          errors.push(`Referenced data does not exist. ${dbError.detail}`);
        }
      } else if (dbError.constraint) {
        
        const constraintMatch = dbError.constraint.match(/(\w+)_(\w+)_fkey/);
        if (constraintMatch) {
          const field = constraintMatch[2].replace(/_/g, ' ');
          errorMessage = `Invalid ${field} selected`;
          errors.push(`The selected ${field} does not exist. Please select a valid option.`);
        } else {
          errors.push(`Referenced data does not exist.`);
        }
      } else {
        errors.push(`Referenced data does not exist.`);
      }
      
      return sendValidationError(res, errorMessage, errors);
    }
      
    case '23502':
      return sendValidationError(res, `Missing required field in ${operation}. All required fields must be provided.`);
      
    case '22001':
      return sendValidationError(res, `Data too long for ${operation}. Please reduce the length of your input.`);
      
    default:
      return sendError(res, `Database error occurred during ${operation}. Please try again later.`);
  }
}
