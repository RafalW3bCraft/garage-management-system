import { useToast } from "@/hooks/use-toast";
import { UseQueryResult, UseMutationResult } from "@tanstack/react-query";

export interface ApiError {
  message: string;
  errors?: string[];
  code?: string;
  status?: number;
}

export interface ErrorHandlerOptions {
  title?: string;
  defaultMessage?: string;
  showToast?: boolean;
  logToConsole?: boolean;
  onError?: (error: Error) => void;
}

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

export function createRetryHandler(refetch: () => void): () => void {
  return () => {
    refetch();
  };
}

export interface ErrorDisplayProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

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
