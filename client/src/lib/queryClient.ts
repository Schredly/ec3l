import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getActiveTenantSlug, setActiveTenantSlug, getActiveUserId, setActiveUserId } from "./activeTenant";

/**
 * Persist tenant slug to localStorage (for bootstrap across page reloads).
 * Also updates the module-level getter so headers reflect the change immediately.
 */
export function setTenantId(slug: string) {
  setActiveTenantSlug(slug);
  localStorage.setItem("tenantId", slug);
}

export function setUserId(id: string) {
  setActiveUserId(id);
  localStorage.setItem("userId", id);
}

function tenantHeaders(): Record<string, string> {
  return { "x-tenant-id": getActiveTenantSlug(), "x-user-id": getActiveUserId() };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = { ...tenantHeaders() };
  if (data) {
    headers["Content-Type"] = "application/json";
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

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: tenantHeaders(),
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
