import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  List,
  Settings,
  ArrowLeft,
  ArrowRight,
  Plus,
  GitBranch,
  Sparkles,
} from "lucide-react";

interface InstalledAppDetail {
  id: string;
  appKey: string;
  displayName: string;
  installedVersion: string;
  status: string;
  recordTypes: { key: string; name: string; id: string }[];
}

export default function AppDashboardPage() {
  const { appKey } = useParams<{ appKey: string }>();
  const [, navigate] = useLocation();

  const { data: app, isLoading } = useQuery<InstalledAppDetail>({
    queryKey: ["/api/apps", appKey],
    queryFn: async () => {
      const res = await fetch(`/api/apps/${appKey}`, {
        headers: {
          "x-tenant-id": localStorage.getItem("tenantId") || "default",
          "x-user-id": localStorage.getItem("userId") || "user-admin",
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!appKey,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <p className="text-sm text-muted-foreground">App not found.</p>
      </div>
    );
  }

  const hasRecordTypes = app.recordTypes.length > 0;

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/apps">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{app.displayName}</h1>
            <Badge variant={app.status === "installed" ? "default" : "secondary"} className="text-[10px]">
              {app.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">v{app.installedVersion}</p>
        </div>
        <Link href={`/apps/${appKey}/manage`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            Manage
          </Button>
        </Link>
      </div>

      {/* Content: action-oriented based on state */}
      {hasRecordTypes ? (
        <>
          {/* Primary actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {app.recordTypes.map((rt) => (
              <Link key={rt.key} href={`/apps/${appKey}/records/${rt.key}`}>
                <Card className="cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center">
                        <List className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{rt.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{rt.key}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">
                      Open Records <ArrowRight className="w-3 h-3" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : (
        /* Getting Started — empty state */
        <Card>
          <CardContent className="p-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Getting Started</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This app hasn't been configured yet. Set it up by adding record types, workflows, or enhancing it with AI.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/primitives")}
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm font-medium">Add Record Type</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate("/workflow-monitor")}
              >
                <GitBranch className="w-5 h-5" />
                <span className="text-sm font-medium">Configure Workflow</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => navigate(`/apps/${appKey}/manage`)}
              >
                <Sparkles className="w-5 h-5" />
                <span className="text-sm font-medium">Propose Enhancement with AI</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
