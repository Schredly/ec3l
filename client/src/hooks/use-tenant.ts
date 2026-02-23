import { useEffect, useState } from "react";
import { setTenantId } from "@/lib/queryClient";
import { useTenantContext } from "@/tenant/tenantStore";

// UUIDs are 36 chars with dashes — slugs are short lowercase strings.
// If localStorage holds a UUID from a previous buggy session, clear it.
function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function useTenantBootstrap() {
  const stored = localStorage.getItem("tenantId");
  const { activeTenant, setActiveTenant } = useTenantContext();
  const [ready, setReady] = useState(() => !!stored && !isUUID(stored));

  useEffect(() => {
    if (stored && !isUUID(stored)) {
      // Already have a valid slug — ensure context is populated
      if (!activeTenant) {
        // Hydrate context from localStorage without clearing queries
        const name = localStorage.getItem("tenantName") || stored;
        const id = localStorage.getItem("tenantUuid") || "";
        // Set directly via context internals (don't trigger navigate/clear)
        setActiveTenant({ id, slug: stored, name });
      }
      setReady(true);
      return;
    }

    // Clear stale UUID if present
    if (stored && isUUID(stored)) {
      localStorage.removeItem("tenantId");
    }

    fetch("/api/tenants")
      .then((r) => {
        if (!r.ok) throw new Error("API unavailable");
        return r.json();
      })
      .then((tenants: { id: string; slug: string; name: string }[]) => {
        if (tenants.length > 0) {
          const preferred = tenants.find((t) => t.slug === "default") ?? tenants[0];
          setTenantId(preferred.slug);
          localStorage.setItem("tenantName", preferred.name);
          localStorage.setItem("tenantUuid", preferred.id);
          setActiveTenant({ id: preferred.id, slug: preferred.slug, name: preferred.name });
        } else {
          setTenantId("default");
        }
        setReady(true);
      })
      .catch(() => {
        setTenantId("default");
        setReady(true);
      });
  }, []);

  return ready;
}
