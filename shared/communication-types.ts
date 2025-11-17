

export interface CommunicationResult {
  success: boolean;
  message: string;
  errorCode?: string;
  errorType?: 'validation' | 'authentication' | 'rate_limit' | 'service_unavailable' | 'policy_violation' | 'network' | 'unknown';
  retryable?: boolean;
  retryCount?: number;
  totalAttempts?: number;
  timestamp?: Date;
  service: 'whatsapp' | 'email';

  metadata?: {

    messageSid?: string;
    finalFailure?: boolean;

    rateLimited?: boolean;
    expiresIn?: number;
    maxAttempts?: number;
    attempts?: number;
    expired?: boolean;

    emailId?: string;
    statusCode?: number;

    fallbackUsed?: 'whatsapp' | 'email';
    originalError?: string;
    fallbackAttempted?: boolean;

    circuitBreakerOpen?: boolean;
    needsImplementation?: boolean;
  };

  messageSid?: string;
  error?: string;
  finalFailure?: boolean;
  rateLimited?: boolean;
  expiresIn?: number;
  attempts?: number;
  maxAttempts?: number;
  expired?: boolean;

  fallbackUsed?: 'whatsapp' | 'email';
  originalError?: string;
  fallbackAttempted?: boolean;
  circuitBreakerOpen?: boolean;
}

export function createCommunicationResult(
  service: 'whatsapp' | 'email',
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

  if (options.metadata) {
    if (options.metadata.messageSid) result.messageSid = options.metadata.messageSid;
    if (options.metadata.finalFailure) result.finalFailure = options.metadata.finalFailure;
    if (options.metadata.rateLimited) result.rateLimited = options.metadata.rateLimited;
    if (options.metadata.expiresIn) result.expiresIn = options.metadata.expiresIn;
    if (options.metadata.attempts) result.attempts = options.metadata.attempts;
    if (options.metadata.maxAttempts) result.maxAttempts = options.metadata.maxAttempts;
    if (options.metadata.expired) result.expired = options.metadata.expired;
  }

  if (!success && !result.error) {
    result.error = message;
  }
  
  return result;
}

export function categorizeError(errorCode?: string, errorMessage?: string): CommunicationResult['errorType'] {
  if (!errorCode && !errorMessage) return 'unknown';
  
  const code = String(errorCode || '').toLowerCase();
  const message = (errorMessage || '').toLowerCase();

  if (code.includes('401') || code.includes('20003') || message.includes('authentication') || message.includes('unauthorized')) {
    return 'authentication';
  }

  if (code.includes('429') || code.includes('63021') || message.includes('rate limit') || message.includes('too many')) {
    return 'rate_limit';
  }

  if (code.includes('400') || code.startsWith('21') || message.includes('invalid') || message.includes('validation')) {
    return 'validation';
  }

  if (code.includes('403') || code.includes('63018') || code.includes('63032') || message.includes('policy') || message.includes('violation')) {
    return 'policy_violation';
  }

  if (code.includes('500') || code.includes('503') || message.includes('unavailable') || message.includes('timeout')) {
    return 'service_unavailable';
  }

  if (message.includes('network') || message.includes('connection') || message.includes('dns')) {
    return 'network';
  }
  
  return 'unknown';
}

export function isErrorRetryable(errorType: CommunicationResult['errorType'], errorCode?: string): boolean {

  const nonRetryableTypes: CommunicationResult['errorType'][] = [
    'validation',
    'authentication', 
    'policy_violation'
  ];
  
  if (nonRetryableTypes.includes(errorType)) {
    return false;
  }

  if (errorType === 'rate_limit') {
    return true;
  }

  if (errorType === 'service_unavailable' || errorType === 'network') {
    return true;
  }

  if (errorType === 'unknown' && errorCode) {

    const nonRetryableCodes = [
      '21211', '21212', '21614', '21610', '21408', '21623', '21609',
      '63013', '63016', '63018', '63021', '63024', '63032',
      '20003', '20404', '30002', '30454', '63038', '90010'
    ];
    return !nonRetryableCodes.includes(String(errorCode));
  }

  return true;
}
