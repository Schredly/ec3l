import { useEffect, useState } from "react";
import { setTenantId } from "@/lib/queryClient";

// UUIDs are 36 chars with dashes — slugs are short lowercase strings.
// If localStorage holds a UUID from a previous buggy session, clear it.
function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function useTenantBootstrap() {
  const stored = localStorage.getItem("tenantId");
  const [ready, setReady] = useState(() => !!stored && !isUUID(stored));

  useEffect(() => {
    if (stored && !isUUID(stored)) {
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
      .then((tenants: { id: string; slug: string }[]) => {
        if (tenants.length > 0) {
          const preferred = tenants.find((t) => t.slug === "default") ?? tenants[0];
          setTenantId(preferred.slug);
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
