import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Building2,
  AppWindow,
  Layers,
  Workflow,
  CheckCircle,
  GitPullRequestArrow,
  ShieldAlert,
} from "lucide-react";

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
        <div className="border rounded-md p-8 flex items-center justify-center text-muted-foreground" data-testid={`admin-panel-${activeItem.key}`}>
          <p className="text-sm">{activeItem.title} management will appear here.</p>
        </div>
      </div>
    </div>
  );
}
