import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the LoadingSpinner component
 */
interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
}

/**
 * Loading spinner component with customizable size and optional loading text.
 * Displays an animated spinner with configurable appearance.
 * 
 * @param {LoadingSpinnerProps} props - Component props
 * @param {string} [props.className] - Additional CSS classes
 * @param {"sm" | "md" | "lg"} [props.size="md"] - Spinner size
 * @param {string} [props.text="Loading..."] - Optional loading text
 * @returns {JSX.Element} The rendered loading spinner
 * 
 * @example
 * ```tsx
 * <LoadingSpinner size="lg" text="Please wait..." />
 * ```
 */
export function LoadingSpinner({ 
  className, 
  size = "md", 
  text = "Loading..." 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-2">
      <Loader2 
        className={cn(
          "animate-spin text-muted-foreground",
          sizeClasses[size],
          className
        )} 
      />
      {text && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}
