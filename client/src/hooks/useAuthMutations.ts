import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { AuthMode, AuthMethod, AuthContext } from "./useAuthFlow";

// Types for mutation data
interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
}

interface SendOtpData {
  phone: string;
  countryCode: string;
  purpose: string;
}

interface VerifyOtpData {
  phone: string;
  countryCode: string;
  otpCode: string;
}

interface RegisterMobileData {
  phone: string;
  countryCode: string;
  name: string;
}

// Callbacks for mutation success/error handling
interface AuthMutationCallbacks {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onTransition?: (nextStep?: string) => void;
  onComplete?: () => void;
}

// Hook for centralized auth mutations with toast handling
export function useAuthMutations(callbacks?: AuthMutationCallbacks) {
  const { toast } = useToast();
  const { login, register, googleLogin, loginMutation, registerMutation } = useAuth();
  
  // Centralized error handler
  const handleError = (error: any, defaultMessage: string) => {
    const message = error?.message || defaultMessage;
    toast({
      title: "Error",
      description: message,
      variant: "destructive",
    });
    callbacks?.onError?.(error);
  };
  
  // Centralized success handler
  const handleSuccess = (title: string, description: string) => {
    toast({
      title,
      description,
    });
    callbacks?.onSuccess?.();
  };
  
  // Mobile OTP mutations
  const sendOtpMutation = useMutation({
    mutationFn: async (data: SendOtpData) => {
      const response = await apiRequest("POST", "/api/auth/mobile/send-otp", data);
      return response.json();
    },
    onSuccess: (data, variables) => {
      handleSuccess(
        "OTP Sent", 
        `Verification code sent to ${variables.countryCode}${variables.phone}`
      );
      callbacks?.onTransition?.("otp-verification");
    },
    onError: (error) => {
      handleError(error, "Failed to send OTP. Please try again.");
    },
  });
  
  const verifyOtpMutation = useMutation({
    mutationFn: async (data: VerifyOtpData) => {
      const response = await apiRequest("POST", "/api/auth/mobile/verify-otp", data);
      return response.json();
    },
    onSuccess: (_, __, { mode }: { mode: AuthMode }) => {
      if (mode === "register") {
        // For registration, go to profile setup
        callbacks?.onTransition?.("profile-setup");
      } else {
        // For login, complete the process
        handleSuccess("Success", "Logged in successfully");
        callbacks?.onComplete?.();
      }
    },
    onError: (error) => {
      handleError(error, "OTP verification failed. Please check your code and try again.");
    },
  });
  
  const registerMobileMutation = useMutation({
    mutationFn: async (data: RegisterMobileData) => {
      const response = await apiRequest("POST", "/api/auth/mobile/register", data);
      return response.json();
    },
    onSuccess: () => {
      handleSuccess("Success", "Account created successfully");
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Registration failed. Please try again.");
    },
  });
  
  // Enhanced wrappers for existing mutations with toast handling
  const loginWithToast = (data: LoginData) => {
    login(data);
  };
  
  const registerWithToast = (data: RegisterData) => {
    register(data);
  };
  
  // Handle existing mutation success/error states
  const handleExistingMutations = () => {
    // Handle login mutation
    if (loginMutation.isSuccess) {
      handleSuccess("Success", "Logged in successfully");
      callbacks?.onComplete?.();
    }
    
    if (loginMutation.isError) {
      handleError(loginMutation.error, "Login failed. Please check your credentials.");
    }
    
    // Handle register mutation
    if (registerMutation.isSuccess) {
      handleSuccess("Success", "Account created successfully");
      callbacks?.onComplete?.();
    }
    
    if (registerMutation.isError) {
      handleError(registerMutation.error, "Registration failed. Please try again.");
    }
  };
  
  // Google login with toast
  const googleLoginWithToast = () => {
    try {
      googleLogin();
    } catch (error) {
      handleError(error, "Google login failed. Please try again.");
    }
  };
  
  // Composite mutation handlers for different auth flows
  const executeLogin = (method: AuthMethod, data: any, context: AuthContext) => {
    switch (method) {
      case "email":
        loginWithToast({
          email: context.email!,
          password: data.password,
        });
        break;
        
      case "mobile":
        // Mobile login is handled by OTP verification
        break;
        
      case "google":
        googleLoginWithToast();
        break;
    }
  };
  
  const executeRegister = (method: AuthMethod, data: any, context: AuthContext) => {
    switch (method) {
      case "email":
        registerWithToast({
          email: context.email!,
          name: data.name,
          password: context.password!,
          confirmPassword: context.password!,
        });
        break;
        
      case "mobile":
        registerMobileMutation.mutate({
          phone: context.phone!,
          countryCode: context.countryCode!,
          name: data.name,
        });
        break;
        
      case "google":
        googleLoginWithToast();
        break;
    }
  };
  
  const sendOtp = (phone: string, countryCode: string, mode: AuthMode) => {
    sendOtpMutation.mutate({
      phone,
      countryCode,
      purpose: mode === "login" ? "login" : "registration",
    });
  };
  
  const verifyOtp = (phone: string, countryCode: string, otpCode: string, mode: AuthMode) => {
    verifyOtpMutation.mutate(
      { phone, countryCode, otpCode },
      { mode } as any // Pass mode through context
    );
  };
  
  // Get loading states
  const isLoading = 
    loginMutation.isPending || 
    registerMutation.isPending ||
    sendOtpMutation.isPending ||
    verifyOtpMutation.isPending ||
    registerMobileMutation.isPending;
  
  return {
    // Mutations
    sendOtpMutation,
    verifyOtpMutation,
    registerMobileMutation,
    loginMutation,
    registerMutation,
    
    // Composite handlers
    executeLogin,
    executeRegister,
    sendOtp,
    verifyOtp,
    
    // Individual handlers
    loginWithToast,
    registerWithToast,
    googleLoginWithToast,
    
    // State
    isLoading,
    
    // Handlers for existing mutations (to be called in useEffect)
    handleExistingMutations,
    
    // Error handling
    handleError,
    handleSuccess,
  };
}