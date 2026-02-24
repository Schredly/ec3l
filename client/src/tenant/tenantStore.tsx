import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { queryClient, setTenantId } from "@/lib/queryClient";
import { getActiveTenantSlug } from "@/lib/activeTenant";

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

interface TenantContextValue {
  activeTenant: TenantInfo | null;
  setActiveTenant: (tenant: TenantInfo) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  // Initial state is null — URL drives tenant identity via TenantRouteSync.
  const [activeTenant, setActive] = useState<TenantInfo | null>(null);

  const setActiveTenant = useCallback(
    (tenant: TenantInfo) => {
      // Only clear cache if the slug actually changed (avoids wiping
      // freshly-fetched data when TenantRouteSync hydrates full info).
      const slugChanged = getActiveTenantSlug() !== tenant.slug;

      // Update module-level state + localStorage
      setTenantId(tenant.slug);
      localStorage.setItem("tenantName", tenant.name);
      localStorage.setItem("tenantUuid", tenant.id);

      // Update React context state
      setActive(tenant);

      if (slugChanged) {
        queryClient.clear();
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
