import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {

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
        return ["email"];
      } catch {
        return ["email"];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

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
