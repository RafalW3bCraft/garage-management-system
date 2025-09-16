import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

export function useAuth() {
  const queryClient = useQueryClient();

  // Get current user
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          return data.user;
        }
        return null;
      } catch {
        return null;
      }
    },
    retry: false,
  });

  // Get available auth providers
  const { data: providers } = useQuery<string[]>({
    queryKey: ["/api/auth/providers"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/providers", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          return data.providers;
        }
        return ["email"]; // fallback to email only
      } catch {
        return ["email"];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - providers don't change often
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: LoginData): Promise<AuthResponse> => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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
    },
  });

  // Helper functions
  const login = (data: LoginData) => loginMutation.mutate(data);
  const register = (data: RegisterData) => registerMutation.mutate(data);
  const logout = () => logoutMutation.mutate();

  const googleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    providers: providers || ["email"],
    isGoogleEnabled: providers?.includes("google") || false,
    login,
    register,
    logout,
    googleLogin,
    loginMutation,
    registerMutation,
    logoutMutation,
  };
}