import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logError } from "@/lib/error-utils";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {

    logError(error, "ErrorBoundary - React Component Error");

    console.error("Component stack:", errorInfo.componentStack);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  

  renderDefaultFallback(error: Error): ReactNode {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <CardTitle className="text-xl">Something went wrong</CardTitle>
            </div>
            <CardDescription>
              An unexpected error occurred in the application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-mono text-muted-foreground break-all">
                {error.message || "Unknown error"}
              </p>
            </div>
            
            <div className="flex flex-col gap-2">
              <Button
                onClick={this.resetError}
                className="w-full"
                data-testid="button-error-retry"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              
              <Button
                variant="outline"
                onClick={() => window.location.href = "/"}
                className="w-full"
                data-testid="button-error-home"
              >
                Go to Home
              </Button>
            </div>
            
            <div className="text-xs text-muted-foreground text-center">
              If the problem persists, please contact support
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {

      if (fallback) {
        return fallback(error, this.resetError);
      }
      
      return this.renderDefaultFallback(error);
    }

    return children;
  }
}

export default ErrorBoundary;
