import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { queryClient, setTenantId } from "@/lib/queryClient";
import { setActiveTenantSlug } from "@/lib/activeTenant";

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

interface TenantContextValue {
  activeTenant: TenantInfo | null;
  setActiveTenant: (tenant: TenantInfo, navigate?: (path: string) => void) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [activeTenant, setActive] = useState<TenantInfo | null>(() => {
    // Bootstrap: read from localStorage and hydrate module-level state
    const slug = localStorage.getItem("tenantId");
    const name = localStorage.getItem("tenantName");
    const id = localStorage.getItem("tenantUuid");
    if (slug) {
      setActiveTenantSlug(slug);
      return { id: id || "", slug, name: name || slug };
    }
    return null;
  });

  const setActiveTenant = useCallback(
    (tenant: TenantInfo, navigate?: (path: string) => void) => {
      // 1. Update module-level state + localStorage (so headers resolve immediately)
      setTenantId(tenant.slug);
      localStorage.setItem("tenantName", tenant.name);
      localStorage.setItem("tenantUuid", tenant.id);

      // 2. Update React context state
      setActive(tenant);

      // 3. Clear all cached queries so UI reloads in new tenant context
      queryClient.clear();

      // 4. Navigate to safe route to avoid broken cross-tenant paths
      if (navigate) {
        navigate("/");
      }
    },
    [],
  );

  return (
    <TenantContext.Provider value={{ activeTenant, setActiveTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within TenantProvider");
  return ctx;
}
