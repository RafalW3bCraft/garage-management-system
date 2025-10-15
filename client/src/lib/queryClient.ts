import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {

    let errorMessage = res.statusText;
    
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorBody = await res.json();

        if (errorBody && errorBody.success === false && typeof errorBody.message === 'string') {
          errorMessage = errorBody.message;

          if (errorBody.errors && Array.isArray(errorBody.errors)) {
            errorMessage += ': ' + errorBody.errors.join(', ');
          }
        }

        else if (errorBody && typeof errorBody.message === 'string') {
          errorMessage = errorBody.message;
        } else {
          errorMessage = JSON.stringify(errorBody);
        }
      } else {
        const text = await res.text();
        if (text) errorMessage = text;
      }
    } catch {

      errorMessage = res.statusText || `HTTP ${res.status}`;
    }
    
    const error = new Error(errorMessage) as Error & { status: number };
    error.status = res.status;
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

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    headers["X-CSRF-Protection"] = import.meta.env.VITE_CSRF_TOKEN || "ronak-garage";
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

function extractResponseData<T>(responseBody: unknown): T {

  if (responseBody && typeof responseBody === 'object' && 'success' in responseBody && responseBody.success === true && 'data' in responseBody) {
    return (responseBody as { data: T }).data;
  }

  return responseBody as T;
}

export async function apiRequestJson<T>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await apiRequest(method, url, data);

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  
  try {
    const responseBody = await res.json();
    return extractResponseData<T>(responseBody);
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
export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (options.on401 === "returnNull" && res.status === 401) {
      return null as T;
    }

    await throwIfResNotOk(res);
    const responseBody = await res.json();
    return extractResponseData<T>(responseBody);
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
