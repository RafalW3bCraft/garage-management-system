import { useToast } from "@/hooks/use-toast";
import { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

/**
 * Standardized error response type from API
 */
export interface ApiError {
  message: string;
  errors?: string[];
  code?: string;
  status?: number;
}

/**
 * Error handler configuration options
 */
export interface ErrorHandlerOptions {
  title?: string;
  defaultMessage?: string;
  showToast?: boolean;
  logToConsole?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Centralized error logging function with context
 * 
 * @param {Error} error - The error object to log
 * @param {string} [context] - Optional context string for debugging
 * 
 * @example
 * ```tsx
 * logError(error, "UserProfile - fetchUserData");
 * ```
 */
export function logError(error: Error, context?: string): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context: context || "Unknown",
    message: error.message,
    stack: error.stack,
    ...(error as any).status && { status: (error as any).status },
  };
  
  console.error(`[ERROR] ${context || "App"}:`, errorInfo);
}

/**
 * Extract user-friendly error message from error object
 * 
 * @param {unknown} error - Error object from API or other sources
 * @param {string} defaultMessage - Fallback message if error parsing fails
 * @returns {string} User-friendly error message
 */
export function extractErrorMessage(error: unknown, defaultMessage: string): string {
  if (!error) return defaultMessage;
  
  if (error instanceof Error) {
    return error.message || defaultMessage;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  return defaultMessage;
}

/**
 * Handle query errors with standardized toast notifications and logging
 * 
 * @param {Error} error - The error object from useQuery
 * @param {ErrorHandlerOptions} [options] - Configuration options
 * 
 * @example
 * ```tsx
 * const { data, isError, error } = useQuery({
 *   queryKey: ["/api/users"],
 *   onError: (error) => handleQueryError(error, {
 *     title: "Failed to Load Users",
 *     defaultMessage: "Could not fetch user data"
 *   })
 * });
 * ```
 */
export function handleQueryError(
  error: Error,
  options: ErrorHandlerOptions = {}
): void {
  const {
    title = "Error Loading Data",
    defaultMessage = "Failed to load data. Please try again.",
    showToast = true,
    logToConsole = true,
    onError,
  } = options;
  
  const message = extractErrorMessage(error, defaultMessage);
  
  if (logToConsole) {
    logError(error, options.title);
  }
  
  if (onError) {
    onError(error);
  }
}

/**
 * Handle mutation errors with standardized toast notifications and logging
 * 
 * @param {Error} error - The error object from useMutation
 * @param {ErrorHandlerOptions} [options] - Configuration options
 * 
 * @example
 * ```tsx
 * const mutation = useMutation({
 *   mutationFn: updateUser,
 *   onError: (error) => handleMutationError(error, {
 *     title: "Update Failed",
 *     defaultMessage: "Could not update user"
 *   })
 * });
 * ```
 */
export function handleMutationError(
  error: Error,
  options: ErrorHandlerOptions = {}
): void {
  const {
    title = "Action Failed",
    defaultMessage = "Failed to complete action. Please try again.",
    showToast = true,
    logToConsole = true,
    onError,
  } = options;
  
  const message = extractErrorMessage(error, defaultMessage);
  
  if (logToConsole) {
    logError(error, options.title);
  }
  
  if (onError) {
    onError(error);
  }
}

/**
 * Hook for consistent error handling across components
 * Provides unified error handling functions with toast notifications
 * 
 * @returns {object} Error handling utilities
 * @property {(error: Error, options?: ErrorHandlerOptions) => void} handleError - Generic error handler
 * @property {(error: Error, options?: ErrorHandlerOptions) => void} handleQueryError - Query-specific error handler
 * @property {(error: Error, options?: ErrorHandlerOptions) => void} handleMutationError - Mutation-specific error handler
 * 
 * @example
 * ```tsx
 * const { handleError, handleQueryError, handleMutationError } = useErrorHandler();
 * 
 * const { data } = useQuery({
 *   queryKey: ["/api/data"],
 *   onError: (error) => handleQueryError(error, {
 *     title: "Failed to Load",
 *     defaultMessage: "Could not fetch data"
 *   })
 * });
 * 
 * const mutation = useMutation({
 *   mutationFn: saveData,
 *   onError: (error) => handleMutationError(error, {
 *     title: "Save Failed"
 *   })
 * });
 * ```
 */
export function useErrorHandler() {
  const { toast } = useToast();
  
  const handleError = (error: Error, options: ErrorHandlerOptions = {}) => {
    const {
      title = "Error",
      defaultMessage = "An error occurred. Please try again.",
      showToast = true,
      logToConsole = true,
      onError: onErrorCallback,
    } = options;
    
    const message = extractErrorMessage(error, defaultMessage);
    
    if (logToConsole) {
      logError(error, title);
    }
    
    if (showToast) {
      toast({
        title,
        description: message,
        variant: "destructive",
      });
    }
    
    if (onErrorCallback) {
      onErrorCallback(error);
    }
  };
  
  const handleQueryErrorWithToast = (error: Error, options: ErrorHandlerOptions = {}) => {
    const {
      title = "Error Loading Data",
      defaultMessage = "Failed to load data. Please try again.",
    } = options;
    
    handleError(error, {
      ...options,
      title,
      defaultMessage,
    });
  };
  
  const handleMutationErrorWithToast = (error: Error, options: ErrorHandlerOptions = {}) => {
    const {
      title = "Action Failed",
      defaultMessage = "Failed to complete action. Please try again.",
    } = options;
    
    handleError(error, {
      ...options,
      title,
      defaultMessage,
    });
  };
  
  return {
    handleError,
    handleQueryError: handleQueryErrorWithToast,
    handleMutationError: handleMutationErrorWithToast,
  };
}

/**
 * Create a retry handler that uses refetch instead of window.location.reload
 * 
 * @param {() => void} refetch - The refetch function from useQuery
 * @returns {() => void} Retry handler function
 * 
 * @example
 * ```tsx
 * const { data, refetch, isError } = useQuery({ queryKey: ["/api/data"] });
 * const handleRetry = createRetryHandler(refetch);
 * 
 * if (isError) {
 *   return <Button onClick={handleRetry}>Retry</Button>;
 * }
 * ```
 */
export function createRetryHandler(refetch: () => void): () => void {
  return () => {
    refetch();
  };
}

/**
 * Standardized error display component props for consistent error UI
 */
export interface ErrorDisplayProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Get standardized error display props from query result
 * 
 * @param {UseQueryResult} query - The query result object
 * @param {string} defaultMessage - Default error message
 * @returns {ErrorDisplayProps | null} Error display props or null if no error
 * 
 * @example
 * ```tsx
 * const query = useQuery({ queryKey: ["/api/data"] });
 * const errorProps = getQueryErrorProps(query, "Failed to load data");
 * 
 * if (errorProps) {
 *   return <ErrorDisplay {...errorProps} />;
 * }
 * ```
 */
export function getQueryErrorProps(
  query: UseQueryResult,
  defaultMessage: string = "Failed to load data"
): ErrorDisplayProps | null {
  if (!query.isError || !query.error) return null;
  
  return {
    title: "Error Loading Data",
    message: extractErrorMessage(query.error, defaultMessage),
    onRetry: () => query.refetch(),
    retryLabel: "Retry",
  };
}
