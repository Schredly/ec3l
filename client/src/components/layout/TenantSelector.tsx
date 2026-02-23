import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenantContext, type TenantInfo } from "@/tenant/tenantStore";

interface TenantListItem {
  id: string;
  name: string;
  slug: string;
}

export function TenantSelector() {
  const { activeTenant, setActiveTenant } = useTenantContext();
  const [, navigate] = useLocation();

  const { data: tenants } = useQuery<TenantListItem[]>({
    queryKey: ["tenants-list"],
    queryFn: async () => {
      // Fetch without tenant headers — /api/tenants is above tenant middleware
      const res = await fetch("/api/tenants");
      if (!res.ok) throw new Error("Failed to fetch tenants");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (!tenants || tenants.length <= 1) {
    // Single tenant — show label only, no dropdown
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tenant
        </span>
        <span className="text-xs font-medium">
          {activeTenant?.name || activeTenant?.slug || "default"}
        </span>
      </div>
    );
  }

  const handleChange = (slug: string) => {
    const tenant = tenants.find((t) => t.slug === slug);
    if (tenant && tenant.slug !== activeTenant?.slug) {
      const info: TenantInfo = { id: tenant.id, slug: tenant.slug, name: tenant.name };
      setActiveTenant(info, navigate);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Tenant
      </span>
      <Select value={activeTenant?.slug || ""} onValueChange={handleChange}>
        <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs border-0 bg-muted/50 focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Select tenant" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((t) => (
            <SelectItem key={t.slug} value={t.slug} className="text-xs">
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
