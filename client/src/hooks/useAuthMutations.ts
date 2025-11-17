import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { AuthMode, AuthMethod, AuthContext } from "./useAuthFlow";
import type { User } from "@shared/schema";

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

interface AuthResponse {
  message: string;
  user: User;
}

interface AuthMutationCallbacks {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onTransition?: (nextStep?: string) => void;
  onComplete?: () => void;
}

export function useAuthMutations(callbacks?: AuthMutationCallbacks) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleError = (error: Error, defaultMessage: string) => {
    const message = error?.message || defaultMessage;
    toast({
      title: "Error",
      description: message,
      variant: "destructive",
    });
    callbacks?.onError?.(error);
  };

  const handleSuccess = (title: string, description: string) => {
    toast({
      title,
      description,
    });
    callbacks?.onSuccess?.();
  };

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData): Promise<any> => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data) => {

      const user = data?.data || data?.user;
      const message = data?.message || "Logged in successfully";
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      handleSuccess("Success", message);
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Login failed. Please check your credentials.");
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData): Promise<any> => {

      const { confirmPassword, ...sanitizedData } = data;
      const response = await apiRequest("POST", "/api/auth/register", sanitizedData);
      return response.json();
    },
    onSuccess: (data) => {

      const message = data?.data?.message || data?.message || "Account created successfully";
      queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      handleSuccess("Success", message);
      callbacks?.onComplete?.();
    },
    onError: (error) => {
      handleError(error, "Registration failed. Please try again.");
    },
  });

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

  const googleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const executeLogin = (method: AuthMethod, data: { password: string }, context: AuthContext) => {
    switch (method) {
      case "email":
        loginMutation.mutate({
          email: context.email!,
          password: data.password,
        });
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
        
      case "google":
        googleLogin();
        break;
    }
  };
  
  const isLoading = 
    loginMutation.isPending || 
    registerMutation.isPending ||
    logoutMutation.isPending;
  
  return {
    loginMutation,
    registerMutation,
    logoutMutation,
    executeLogin,
    executeRegister,
    googleLogin,
    isLoading,
    handleError,
    handleSuccess,
  };
}
