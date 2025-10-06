import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { AuthMode, AuthMethod, AuthContext } from "./useAuthFlow";
import type { User } from "@shared/schema";

/**
 * Login mutation data interface
 */
interface LoginData {
  email: string;
  password: string;
}

/**
 * Registration mutation data interface
 */
interface RegisterData {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
}

/**
 * Send OTP mutation data interface
 */
interface SendOtpData {
  phone?: string;
  countryCode?: string;
  email?: string;
  channel: 'whatsapp' | 'email';
  purpose: string;
}

/**
 * Verify OTP mutation data interface
 */
interface VerifyOtpData {
  phone: string;
  countryCode: string;
  otpCode: string;
  purpose: string;
}

/**
 * Mobile registration mutation data interface
 */
interface RegisterMobileData {
  phone: string;
  countryCode: string;
  name: string;
}

/**
 * Authentication response interface
 */
interface AuthResponse {
  message: string;
  user: User;
}

/**
 * Callbacks for mutation success/error handling
 */
interface AuthMutationCallbacks {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onTransition?: (nextStep?: string) => void;
  onComplete?: () => void;
}

/**
 * Hook for centralized authentication mutations with automatic toast notifications.
 * Provides mutations for login, registration, logout, and mobile OTP verification.
 * Handles query cache invalidation and success/error callbacks.
 * 
 * @param {AuthMutationCallbacks} [callbacks] - Optional callbacks for mutation lifecycle
 * @returns {object} Authentication mutations and methods
 * @property {object} loginMutation - Login mutation
 * @property {object} registerMutation - Registration mutation
 * @property {object} logoutMutation - Logout mutation
 * @property {object} sendOtpMutation - Send OTP mutation
 * @property {object} verifyOtpMutation - Verify OTP mutation
 * @property {object} registerMobileMutation - Mobile registration mutation
 * @property {(method: AuthMethod, data: object, context: AuthContext) => void} executeLogin - Execute login
 * @property {(method: AuthMethod, data: object, context: AuthContext) => void} executeRegister - Execute registration
 * @property {(channel: 'whatsapp' | 'email', mode: AuthMode, phone?: string, countryCode?: string, email?: string) => void} sendOtp - Send OTP
 * @property {(phone: string, countryCode: string, otpCode: string, mode: AuthMode) => void} verifyOtp - Verify OTP
 * @property {() => void} googleLogin - Initiate Google OAuth
 * @property {boolean} isLoading - Whether any mutation is loading
 * 
 * @example
 * ```tsx
 * const { executeLogin, sendOtp, isLoading } = useAuthMutations({
 *   onComplete: () => navigate("/dashboard"),
 *   onError: (error) => console.error(error)
 * });
 * 
 * // Execute email login
 * executeLogin("email", { password: "******" }, { email: "user@example.com" });
 * 
 * // Send mobile OTP
 * sendOtp("9876543210", "+91", "login");
 * ```
 */
export function useAuthMutations(callbacks?: AuthMutationCallbacks) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Centralized error handler
  const handleError = (error: Error, defaultMessage: string) => {
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
  
  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: LoginData): Promise<AuthResponse> => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      handleSuccess("Success", "Logged in successfully");
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Login failed. Please check your credentials.");
    },
  });
  
  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData): Promise<AuthResponse> => {
      // Remove confirmPassword before sending to server
      const { confirmPassword, ...sanitizedData } = data;
      const response = await apiRequest("POST", "/api/auth/register", sanitizedData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      handleSuccess("Success", "Account created successfully");
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Registration failed. Please try again.");
    },
  });
  
  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      handleSuccess("Success", "Logged out successfully");
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Logout failed. Please try again.");
    },
  });
  
  // Mobile OTP mutations
  const sendOtpMutation = useMutation({
    mutationFn: async (data: SendOtpData) => {
      const response = await apiRequest("POST", "/api/auth/mobile/send-otp", data);
      return response.json();
    },
    onSuccess: (data, variables) => {
      const channelText = variables.channel === 'email' ? 'email' : 'WhatsApp';
      const destination = variables.channel === 'email' 
        ? variables.email 
        : `${variables.countryCode}${variables.phone}`;
      
      handleSuccess(
        "OTP Sent", 
        `Verification code sent via ${channelText} to ${destination}`
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
    onSuccess: (_, variables) => {
      if (variables.purpose === "registration") {
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
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      handleSuccess("Success", "Account created successfully");
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Registration failed. Please try again.");
    },
  });
  
  // Google login redirect (no mutation needed, just redirects)
  const googleLogin = () => {
    window.location.href = "/api/auth/google";
  };
  
  // Composite mutation handlers for different auth flows
  const executeLogin = (method: AuthMethod, data: { password: string }, context: AuthContext) => {
    switch (method) {
      case "email":
        loginMutation.mutate({
          email: context.email!,
          password: data.password,
        });
        break;
        
      case "mobile":
        // Mobile login is handled by OTP verification
        break;
        
      case "google":
        googleLogin();
        break;
    }
  };
  
  const executeRegister = (method: AuthMethod, data: { name: string }, context: AuthContext) => {
    switch (method) {
      case "email":
        registerMutation.mutate({
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
        googleLogin();
        break;
    }
  };
  
  const sendOtp = (
    channel: 'whatsapp' | 'email',
    mode: AuthMode,
    phone?: string,
    countryCode?: string,
    email?: string
  ) => {
    sendOtpMutation.mutate({
      channel,
      phone,
      countryCode,
      email,
      purpose: mode === "login" ? "login" : "registration",
    });
  };
  
  const verifyOtp = (phone: string, countryCode: string, otpCode: string, mode: AuthMode) => {
    verifyOtpMutation.mutate({ 
      phone, 
      countryCode, 
      otpCode, 
      purpose: mode === "login" ? "login" : "registration" 
    });
  };
  
  // Get loading states
  const isLoading = 
    loginMutation.isPending || 
    registerMutation.isPending ||
    logoutMutation.isPending ||
    sendOtpMutation.isPending ||
    verifyOtpMutation.isPending ||
    registerMobileMutation.isPending;
  
  return {
    // Mutations
    loginMutation,
    registerMutation,
    logoutMutation,
    sendOtpMutation,
    verifyOtpMutation,
    registerMobileMutation,
    
    // Composite handlers
    executeLogin,
    executeRegister,
    sendOtp,
    verifyOtp,
    
    // Individual handlers
    googleLogin,
    
    // State
    isLoading,
    
    // Error handling
    handleError,
    handleSuccess,
  };
}