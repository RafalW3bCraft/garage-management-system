import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

/**
 * Authentication hook providing user state, authentication status, and login methods.
 * Queries current user information and available authentication providers.
 * 
 * @returns {object} Authentication state and methods
 * @property {User | null | undefined} user - Current authenticated user or null
 * @property {boolean} isLoading - Whether user data is being loaded
 * @property {boolean} isAuthenticated - Whether a user is currently authenticated
 * @property {string[]} providers - Available authentication providers (email, google, etc.)
 * @property {boolean} isGoogleEnabled - Whether Google OAuth is enabled
 * @property {() => void} googleLogin - Function to initiate Google OAuth flow
 * 
 * @example
 * ```tsx
 * const { user, isLoading, isAuthenticated, googleLogin } = useAuth();
 * 
 * if (isLoading) return <LoadingSpinner />;
 * if (!isAuthenticated) return <LoginPrompt />;
 * 
 * return <UserProfile user={user} />;
 * ```
 */
export function useAuth() {
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
          return data.data || null;
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
          return data.data?.providers || ["email"];
        }
        return ["email"]; // fallback to email only
      } catch {
        return ["email"];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - providers don't change often
  });

  // Google login redirect
  const googleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    providers: providers || ["email"],
    isGoogleEnabled: providers?.includes("google") || false,
    googleLogin,
  };
}