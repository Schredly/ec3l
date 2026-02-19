import { useEffect, useState } from "react";
import { setTenantId } from "@/lib/queryClient";

export function useTenantBootstrap() {
  const [ready, setReady] = useState(() => !!localStorage.getItem("tenantId"));

  useEffect(() => {
    if (localStorage.getItem("tenantId")) {
      setReady(true);
      return;
    }

    fetch("/api/tenants")
      .then((r) => {
        if (!r.ok) throw new Error("API unavailable");
        return r.json();
      })
      .then((tenants: { id: string }[]) => {
        if (tenants.length > 0) {
          setTenantId(tenants[0].id);
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
