import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { setTenantId as persistTenantId } from "@/lib/queryClient";

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
    const slug = localStorage.getItem("tenantId");
    const name = localStorage.getItem("tenantName");
    const id = localStorage.getItem("tenantUuid");
    if (slug) {
      return { id: id || "", slug, name: name || slug };
    }
    return null;
  });

  const setActiveTenant = useCallback(
    (tenant: TenantInfo, navigate?: (path: string) => void) => {
      // Persist to localStorage (slug is what the server expects)
      persistTenantId(tenant.slug);
      localStorage.setItem("tenantName", tenant.name);
      localStorage.setItem("tenantUuid", tenant.id);

      setActive(tenant);

      // Clear all cached queries so UI reloads in new tenant context
      queryClient.clear();

      // Navigate to safe route to avoid broken cross-tenant paths
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
