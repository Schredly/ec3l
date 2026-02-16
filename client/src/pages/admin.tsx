import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Building2,
  AppWindow,
  Layers,
  Workflow,
  CheckCircle,
  GitPullRequestArrow,
  ShieldAlert,
  Check,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { setTenantId, apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import type { Tenant, ModuleOverride } from "@shared/schema";

const adminNavItems = [
  { title: "Tenants", key: "tenants", icon: Building2 },
  { title: "Apps", key: "apps", icon: AppWindow },
  { title: "Overrides", key: "overrides", icon: Layers },
  { title: "Workflows", key: "workflows", icon: Workflow },
  { title: "Approvals", key: "approvals", icon: CheckCircle },
  { title: "Changes", key: "changes", icon: GitPullRequestArrow },
];

function AdminDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground" data-testid="admin-denied">
      <ShieldAlert className="w-10 h-10" />
      <p className="text-sm font-medium">Access Denied</p>
      <p className="text-xs">You do not have the admin.view permission.</p>
      <Link href="/">
        <span className="text-xs text-primary underline cursor-pointer" data-testid="link-back-dashboard">Back to Dashboard</span>
      </Link>
    </div>
  );
}

function AdminLoading() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <p className="text-sm">Checking access...</p>
    </div>
  );
}

function TenantsPanel() {
  const currentTenantId = localStorage.getItem("tenantId") || "";

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
  });

  const handleSelectTenant = (tenantId: string) => {
    setTenantId(tenantId);
    queryClient.invalidateQueries();
  };

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="tenants-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!tenants || tenants.length === 0) {
    return (
      <div className="border rounded-md p-8 flex items-center justify-center text-muted-foreground" data-testid="tenants-empty">
        <p className="text-sm">No tenants found.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden" data-testid="tenants-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tenant ID</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Context</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => {
            const isSelected = tenant.id === currentTenantId;
            return (
              <tr
                key={tenant.id}
                onClick={() => handleSelectTenant(tenant.id)}
                className={`border-b last:border-b-0 cursor-pointer hover-elevate ${isSelected ? "bg-sidebar-accent" : ""}`}
                data-testid={`tenant-row-${tenant.id}`}
                data-active={isSelected}
              >
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground" data-testid={`tenant-id-${tenant.id}`}>
                  {tenant.id}
                </td>
                <td className="px-4 py-2 font-medium" data-testid={`tenant-name-${tenant.id}`}>
                  {tenant.name}
                </td>
                <td className="px-4 py-2">
                  <Badge variant="secondary" className="text-xs" data-testid={`tenant-status-${tenant.id}`}>
                    {(tenant as any).status || tenant.plan || "active"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground" data-testid={`tenant-created-${tenant.id}`}>
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  {isSelected && (
                    <div className="flex items-center gap-1 text-xs text-primary" data-testid={`tenant-active-${tenant.id}`}>
                      <Check className="w-3 h-3" />
                      <span>Active</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type AdminModule = {
  id: string;
  name: string;
  type: string;
  version: string;
  status: string;
  installedAt: string;
};

function AppsPanel() {
  const { data: modules, isLoading } = useQuery<AdminModule[]>({
    queryKey: ["/api/admin/modules"],
  });

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="apps-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!modules || modules.length === 0) {
    return (
      <div className="border rounded-md p-8 flex items-center justify-center text-muted-foreground" data-testid="apps-empty">
        <p className="text-sm">No modules installed for this tenant.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden" data-testid="apps-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Module Name</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Version</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Installed At</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((mod) => (
            <tr
              key={mod.id}
              className="border-b last:border-b-0"
              data-testid={`app-row-${mod.id}`}
            >
              <td className="px-4 py-2 font-medium" data-testid={`app-name-${mod.id}`}>
                {mod.name}
                <span className="ml-2 text-xs text-muted-foreground font-mono">{mod.type}</span>
              </td>
              <td className="px-4 py-2 font-mono text-xs" data-testid={`app-version-${mod.id}`}>
                {mod.version}
              </td>
              <td className="px-4 py-2" data-testid={`app-status-${mod.id}`}>
                <Badge variant="secondary" className="text-xs">
                  {mod.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground" data-testid={`app-installed-${mod.id}`}>
                {new Date(mod.installedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverridesPanel() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: overrides, isLoading } = useQuery<ModuleOverride[]>({
    queryKey: ["/api/admin/overrides"],
  });

  const activateMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const res = await apiRequest("POST", `/api/overrides/${overrideId}/activate`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Activation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overrides"] });
      toast({ title: "Override activated", description: "The override has been activated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="overrides-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!overrides || overrides.length === 0) {
    return (
      <div className="border rounded-md p-8 flex items-center justify-center text-muted-foreground" data-testid="overrides-empty">
        <p className="text-sm">No overrides found for this tenant.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden" data-testid="overrides-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-8 px-2 py-2" />
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Override ID</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Target</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created By</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created At</th>
          </tr>
        </thead>
        <tbody>
          {overrides.map((ov) => {
            const isExpanded = expandedId === ov.id;
            return (
              <>
                <tr
                  key={ov.id}
                  className="border-b last:border-b-0 cursor-pointer hover-elevate"
                  data-testid={`override-row-${ov.id}`}
                  onClick={() => setExpandedId(isExpanded ? null : ov.id)}
                >
                  <td className="px-2 py-2 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs" data-testid={`override-id-${ov.id}`}>
                    {ov.id.substring(0, 8)}...
                  </td>
                  <td className="px-4 py-2" data-testid={`override-type-${ov.id}`}>
                    <Badge variant="secondary" className="text-xs">
                      {ov.overrideType}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs" data-testid={`override-target-${ov.id}`}>
                    {ov.targetRef}
                  </td>
                  <td className="px-4 py-2" data-testid={`override-status-${ov.id}`}>
                    <Badge variant={ov.status === "active" ? "default" : "secondary"} className="text-xs">
                      {ov.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs" data-testid={`override-createdby-${ov.id}`}>
                    {ov.createdBy}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground" data-testid={`override-createdat-${ov.id}`}>
                    {new Date(ov.createdAt).toLocaleDateString()}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${ov.id}-detail`} className="bg-muted/30" data-testid={`override-detail-${ov.id}`}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                          <div>
                            <span className="text-muted-foreground">Full Override ID:</span>{" "}
                            <span className="font-mono">{ov.id}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Module ID:</span>{" "}
                            <span className="font-mono">{ov.installedModuleId}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Version:</span>{" "}
                            <span>{ov.version}</span>
                          </div>
                          {ov.changeId && (
                            <div>
                              <span className="text-muted-foreground">Change ID:</span>{" "}
                              <span className="font-mono">{ov.changeId}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Patch:</span>
                          <pre className="mt-1 p-2 rounded-md bg-muted text-xs font-mono overflow-auto max-h-40" data-testid={`override-patch-${ov.id}`}>
                            {JSON.stringify(ov.patch, null, 2)}
                          </pre>
                        </div>
                        {ov.status === "draft" && (
                          <div className="pt-1">
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                activateMutation.mutate(ov.id);
                              }}
                              disabled={activateMutation.isPending}
                              data-testid={`override-activate-${ov.id}`}
                            >
                              <Zap className="w-3 h-3 mr-1" />
                              {activateMutation.isPending ? "Activating..." : "Activate"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="border rounded-md p-8 flex items-center justify-center text-muted-foreground" data-testid={`admin-panel-${title.toLowerCase()}`}>
      <p className="text-sm">{title} management will appear here.</p>
    </div>
  );
}

function AdminContent({ activeKey }: { activeKey: string }) {
  if (activeKey === "tenants") return <TenantsPanel />;
  if (activeKey === "apps") return <AppsPanel />;
  if (activeKey === "overrides") return <OverridesPanel />;
  const item = adminNavItems.find((i) => i.key === activeKey);
  return <PlaceholderPanel title={item?.title || activeKey} />;
}

export default function AdminConsole() {
  const [location, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{ allowed: boolean }>({
    queryKey: ["/api/admin/check-access"],
    queryFn: async () => {
      const res = await fetch("/api/admin/check-access", {
        headers: {
          "x-tenant-id": localStorage.getItem("tenantId") || "default",
          "x-user-id": localStorage.getItem("userId") || "user-admin",
        },
      });
      if (res.status === 403) return { allowed: false };
      if (!res.ok) throw new Error("Failed to check access");
      return res.json();
    },
  });

  const activeKey = location.replace("/admin/", "").replace("/admin", "") || "tenants";

  if (isLoading) return <AdminLoading />;
  if (!data?.allowed) return <AdminDenied />;

  const activeItem = adminNavItems.find((i) => i.key === activeKey) || adminNavItems[0];

  return (
    <div className="flex h-full" data-testid="admin-console">
      <nav className="w-52 border-r flex flex-col py-4 px-2 gap-1 shrink-0" data-testid="admin-nav">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Admin Console</p>
        {adminNavItems.map((item) => {
          const isActive = item.key === activeItem.key;
          return (
            <button
              key={item.key}
              onClick={() => setLocation(item.key === "tenants" ? "/admin" : `/admin/${item.key}`)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${isActive ? "bg-sidebar-accent font-medium" : "text-muted-foreground hover-elevate"}`}
              data-testid={`admin-nav-${item.key}`}
              data-active={isActive}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.title}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex-1 p-6 overflow-auto" data-testid="admin-content">
        <div className="flex items-center gap-2 mb-6">
          <activeItem.icon className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{activeItem.title}</h1>
        </div>
        <AdminContent activeKey={activeKey} />
      </div>
    </div>
  );
}
