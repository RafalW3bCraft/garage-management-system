/**
 * Standardized error response interface for all communication services
 */
export interface CommunicationResult {
  success: boolean;
  message: string;
  errorCode?: string;
  errorType?: 'validation' | 'authentication' | 'rate_limit' | 'service_unavailable' | 'policy_violation' | 'network' | 'unknown';
  retryable?: boolean;
  retryCount?: number;
  totalAttempts?: number;
  timestamp?: Date;
  service: 'whatsapp' | 'email' | 'otp' | 'sms';
  // Service-specific metadata
  metadata?: {
    // WhatsApp specific
    messageSid?: string;
    finalFailure?: boolean;
    // OTP specific  
    rateLimited?: boolean;
    expiresIn?: number;
    maxAttempts?: number;
    attempts?: number;
    expired?: boolean;
    // Email specific
    emailId?: string;
    statusCode?: number;
    // Fallback specific
    fallbackUsed?: 'sms' | 'email';
    originalError?: string;
    fallbackAttempted?: boolean;
    // Circuit breaker specific
    circuitBreakerOpen?: boolean;
    needsImplementation?: boolean;
  };
  
  // Legacy compatibility fields (deprecated - use metadata instead)
  messageSid?: string;
  error?: string;
  finalFailure?: boolean;
  rateLimited?: boolean;
  expiresIn?: number;
  attempts?: number;
  maxAttempts?: number;
  expired?: boolean;
  // Fallback fields
  fallbackUsed?: 'sms' | 'email';
  originalError?: string;
  fallbackAttempted?: boolean;
  circuitBreakerOpen?: boolean;
}

/**
 * Helper function to create standardized communication results
 */
export function createCommunicationResult(
  service: 'whatsapp' | 'email' | 'otp' | 'sms',
  success: boolean,
  message: string,
  options: {
    errorCode?: string;
    errorType?: CommunicationResult['errorType'];
    retryable?: boolean;
    retryCount?: number;
    totalAttempts?: number;
    metadata?: CommunicationResult['metadata'];
  } = {}
): CommunicationResult {
  const result: CommunicationResult = {
    success,
    message,
    service,
    timestamp: new Date(),
    ...options,
  };
  
  // Add legacy compatibility fields from metadata
  if (options.metadata) {
    if (options.metadata.messageSid) result.messageSid = options.metadata.messageSid;
    if (options.metadata.finalFailure) result.finalFailure = options.metadata.finalFailure;
    if (options.metadata.rateLimited) result.rateLimited = options.metadata.rateLimited;
    if (options.metadata.expiresIn) result.expiresIn = options.metadata.expiresIn;
    if (options.metadata.attempts) result.attempts = options.metadata.attempts;
    if (options.metadata.maxAttempts) result.maxAttempts = options.metadata.maxAttempts;
    if (options.metadata.expired) result.expired = options.metadata.expired;
  }
  
  // Set error field for backward compatibility
  if (!success && !result.error) {
    result.error = message;
  }
  
  return result;
}

/**
 * Determine error type from error code or message
 */
export function categorizeError(errorCode?: string, errorMessage?: string): CommunicationResult['errorType'] {
  if (!errorCode && !errorMessage) return 'unknown';
  
  const code = String(errorCode || '').toLowerCase();
  const message = (errorMessage || '').toLowerCase();
  
  // Authentication errors
  if (code.includes('401') || code.includes('20003') || message.includes('authentication') || message.includes('unauthorized')) {
    return 'authentication';
  }
  
  // Rate limiting errors
  if (code.includes('429') || code.includes('63021') || message.includes('rate limit') || message.includes('too many')) {
    return 'rate_limit';
  }
  
  // Validation errors
  if (code.includes('400') || code.startsWith('21') || message.includes('invalid') || message.includes('validation')) {
    return 'validation';
  }
  
  // Policy violations
  if (code.includes('403') || code.includes('63018') || code.includes('63032') || message.includes('policy') || message.includes('violation')) {
    return 'policy_violation';
  }
  
  // Service unavailable
  if (code.includes('500') || code.includes('503') || message.includes('unavailable') || message.includes('timeout')) {
    return 'service_unavailable';
  }
  
  // Network errors
  if (message.includes('network') || message.includes('connection') || message.includes('dns')) {
    return 'network';
  }
  
  return 'unknown';
}

/**
 * Determine if error is retryable based on error type and code
 */
export function isErrorRetryable(errorType: CommunicationResult['errorType'], errorCode?: string): boolean {
  // Never retry these error types
  const nonRetryableTypes: CommunicationResult['errorType'][] = [
    'validation',
    'authentication', 
    'policy_violation'
  ];
  
  if (nonRetryableTypes.includes(errorType)) {
    return false;
  }
  
  // Rate limit errors are temporarily retryable (but with backoff)
  if (errorType === 'rate_limit') {
    return true;
  }
  
  // Service and network errors are generally retryable
  if (errorType === 'service_unavailable' || errorType === 'network') {
    return true;
  }
  
  // For unknown errors, check specific error codes if available
  if (errorType === 'unknown' && errorCode) {
    // Twilio-specific non-retryable codes
    const nonRetryableCodes = [
      '21211', '21212', '21614', '21610', '21408', '21623', '21609',
      '63013', '63016', '63018', '63021', '63024', '63032',
      '20003', '20404', '30002', '30454', '63038', '90010'
    ];
    return !nonRetryableCodes.includes(String(errorCode));
  }
  
  // Default to retryable for unknown cases
  return true;
}