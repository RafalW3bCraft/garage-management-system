import { 
  categorizeError, 
  isErrorRetryable,
  type CommunicationResult 
} from '@shared/communication-types';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Generic circuit breaker implementation for communication services
 * 
 * Implements circuit breaker pattern with proper HALF_OPEN state handling:
 * - CLOSED: Normal operation, all requests allowed
 * - OPEN: Fast-failing, no requests allowed (waits for recovery timeout)
 * - HALF_OPEN: Testing recovery with limited probe requests
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly halfOpenMaxAttempts: number = 1;
  private halfOpenAttemptCount: number = 0;
  private readonly serviceName: string;
  
  constructor(serviceName: string, failureThreshold: number, recoveryTimeoutMinutes: number) {
    this.serviceName = serviceName;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeoutMinutes * 60 * 1000;
  }
  
  /**
   * Check if request should be allowed
   */
  canAttempt(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        console.log(`[${this.serviceName}] 🔄 Circuit breaker transitioning to HALF_OPEN - testing service recovery`);
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttemptCount = 0;
        return true;
      }
      return false;
    }
    
    if (this.halfOpenAttemptCount >= this.halfOpenMaxAttempts) {
      console.log(`[${this.serviceName}] 🚫 Circuit breaker HALF_OPEN - max probe attempts (${this.halfOpenMaxAttempts}) reached, rejecting request`);
      return false;
    }
    
    this.halfOpenAttemptCount++;
    console.log(`[${this.serviceName}] 🔍 Circuit breaker HALF_OPEN - allowing probe request ${this.halfOpenAttemptCount}/${this.halfOpenMaxAttempts}`);
    return true;
  }
  
  /**
   * Record successful request
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[${this.serviceName}] ✅ Circuit breaker CLOSED - service recovered`);
    }
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttemptCount = 0;
  }
  
  /**
   * Record failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[${this.serviceName}] ⚠️ Circuit breaker reopening - service still unavailable`);
      this.state = CircuitState.OPEN;
      this.halfOpenAttemptCount = 0;
      return;
    }
    
    if (this.failureCount >= this.failureThreshold) {
      console.log(`[${this.serviceName}] 🚨 Circuit breaker OPEN - ${this.failureCount} consecutive failures detected`);
      console.log(`[${this.serviceName}] ⏰ Will retry in ${this.recoveryTimeout / 60000} minutes`);
      this.state = CircuitState.OPEN;
    }
  }
  
  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }
  
  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }
  
  /**
   * Reset circuit breaker (for testing or manual recovery)
   */
  reset(): void {
    console.log(`[${this.serviceName}] 🔄 Circuit breaker manually reset`);
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttemptCount = 0;
  }
}

/**
 * Retry result containing operation result and metadata
 */
export interface RetryResult<T> {
  result?: T;
  success: boolean;
  error?: Error;
  attempts: number;
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
  backoffMultiplier: number;
}

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMinutes: number;
}

/**
 * Abstract base class for all communication services
 * 
 * Provides common functionality:
 * - Circuit breaker pattern
 * - Retry with exponential backoff
 * - Error categorization and handling
 * - Standardized logging
 */
export abstract class BaseCommunicationService {
  protected readonly serviceName: string;
  protected readonly circuitBreaker: CircuitBreaker;
  protected readonly retryConfig: RetryConfig;
  
  constructor(
    serviceName: string,
    retryConfig: RetryConfig,
    circuitBreakerConfig: CircuitBreakerConfig
  ) {
    this.serviceName = serviceName;
    this.retryConfig = retryConfig;
    this.circuitBreaker = new CircuitBreaker(
      serviceName,
      circuitBreakerConfig.failureThreshold,
      circuitBreakerConfig.recoveryTimeoutMinutes
    );
  }
  
  /**
   * Calculate exponential backoff delay
   */
  protected calculateBackoffDelay(attempt: number): number {
    const delay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }
  
  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Check if error is retryable using standardized error classification
   */
  protected isRetryableError(error: Error): boolean {
    if (!error.message) return true;
    
    const errorCode = (error as any).code ? String((error as any).code) : '';
    const errorMessage = String(error.message || '');
    const errorType = categorizeError(errorCode, errorMessage);
    
    return isErrorRetryable(errorType, errorCode);
  }
  
  /**
   * Retry wrapper with exponential backoff
   * 
   * @param operation - Async operation to retry
   * @param operationName - Name for logging
   * @param maxRetries - Maximum number of retries (overrides config)
   * @returns Result object with success status, result/error, and attempt count
   */
  protected async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries?: number
  ): Promise<RetryResult<T>> {
    const retries = maxRetries ?? this.retryConfig.maxRetries;
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          console.log(`[${this.serviceName}] ✅ ${operationName} succeeded on attempt ${attempt}`);
        }
        
        return { result, success: true, attempts: attempt };
      } catch (error) {
        lastError = error as Error;
        
        console.error(`[${this.serviceName}] ❌ ${operationName} failed on attempt ${attempt}/${retries + 1}: ${lastError.message}`);
        
        if (!this.isRetryableError(lastError)) {
          console.log(`[${this.serviceName}] 🚫 Error is not retryable (${String((lastError as any).code)}), stopping retries`);
          break;
        }
        
        if (attempt > retries) {
          console.log(`[${this.serviceName}] 🛑 Max retries (${retries}) exceeded for ${operationName}`);
          break;
        }
        
        const delay = this.calculateBackoffDelay(attempt);
        console.log(`[${this.serviceName}] ⏳ Retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
        await this.sleep(delay);
      }
    }
    
    return { success: false, error: lastError, attempts: retries + 1 };
  }
  
  /**
   * Execute operation with circuit breaker and retry logic
   * 
   * @param operation - Async operation to execute
   * @param operationName - Name for logging
   * @param options - Optional configuration
   * @returns Result of operation with metadata
   */
  protected async executeWithProtection<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: {
      skipCircuitBreaker?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<RetryResult<T>> {
    if (!options.skipCircuitBreaker && !this.circuitBreaker.canAttempt()) {
      const state = this.circuitBreaker.getState();
      console.log(`[${this.serviceName}] ⚡ Circuit breaker is ${state} - fast failing without retry`);
      
      return {
        success: false,
        error: new Error(`Circuit breaker is ${state}, service unavailable`),
        attempts: 0
      };
    }
    
    const result = await this.retryWithBackoff(operation, operationName, options.maxRetries);
    
    if (!options.skipCircuitBreaker) {
      if (result.success) {
        this.circuitBreaker.recordSuccess();
      } else {
        this.circuitBreaker.recordFailure();
      }
    }
    
    return result;
  }
  
  /**
   * Log message with consistent format
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, emoji?: string): void {
    const prefix = emoji ? `[${this.serviceName}] ${emoji}` : `[${this.serviceName}]`;
    const logMessage = `${prefix} ${message}`;
    
    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
  
  /**
   * Get circuit breaker status (for monitoring/debugging)
   */
  public getCircuitBreakerStatus(): {
    state: string;
    failureCount: number;
    threshold: number;
    recoveryMinutes: number;
  } {
    return {
      state: this.circuitBreaker.getState(),
      failureCount: this.circuitBreaker.getFailureCount(),
      threshold: this.retryConfig.maxRetries,
      recoveryMinutes: 0
    };
  }
  
  /**
   * Manually reset circuit breaker (for admin/debugging)
   */
  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
  
  /**
   * Get retry configuration
   */
  public getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }
}
