import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Try to parse JSON error response for standardized {message} format
    let errorMessage = res.statusText;
    
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorBody = await res.json();
        if (errorBody && typeof errorBody.message === 'string') {
          errorMessage = errorBody.message;
        } else {
          errorMessage = JSON.stringify(errorBody);
        }
      } else {
        const text = await res.text();
        if (text) errorMessage = text;
      }
    } catch {
      // Fallback to status text if JSON parsing fails
      errorMessage = res.statusText || `HTTP ${res.status}`;
    }
    
    const error = new Error(errorMessage);
    (error as any).status = res.status;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add CSRF protection header for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    headers["X-CSRF-Protection"] = "ronak-garage";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Type-safe API request functions to eliminate double assertions
export async function apiRequestJson<T>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await apiRequest(method, url, data);
  
  // Handle empty responses (204 No Content)
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  
  try {
    return await res.json() as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON response from ${method} ${url}`);
  }
}

export async function apiRequestVoid(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<void> {
  await apiRequest(method, url, data);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
