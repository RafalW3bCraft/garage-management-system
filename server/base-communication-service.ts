import { 
  categorizeError, 
  isErrorRetryable,
  type CommunicationResult 
} from '@shared/communication-types';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

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
  
  

  canAttempt(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttemptCount = 0;
        return true;
      }
      return false;
    }
    
    if (this.halfOpenAttemptCount >= this.halfOpenMaxAttempts) {
      return false;
    }
    
    this.halfOpenAttemptCount++;
    return true;
  }
  
  

  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
    }
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttemptCount = 0;
  }
  
  

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.halfOpenAttemptCount = 0;
      return;
    }
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
  
  

  getState(): CircuitState {
    return this.state;
  }
  
  

  getFailureCount(): number {
    return this.failureCount;
  }
  
  

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttemptCount = 0;
  }
}

export interface RetryResult<T> {
  result?: T;
  success: boolean;
  error?: Error;
  attempts: number;
}

export interface RetryConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
  backoffMultiplier: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMinutes: number;
}

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
  
  

  protected calculateBackoffDelay(attempt: number): number {
    const delay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }
  
  

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  

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
        }
        
        return { result, success: true, attempts: attempt };
      } catch (error) {
        lastError = error as Error;
        
        console.error(`[${this.serviceName}] ❌ ${operationName} failed on attempt ${attempt}/${retries + 1}: ${lastError.message}`);
        
        if (!this.isRetryableError(lastError)) {
          break;
        }
        
        if (attempt > retries) {
          break;
        }
        
        const delay = this.calculateBackoffDelay(attempt);
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
    }
  }
  
  

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
  
  

  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
  
  

  public getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }
}
