import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutGrid,
  FileText,
  Clock,
  AlertTriangle,
  ArrowRight,
  Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AppSummary {
  id: string;
  appKey: string;
  displayName: string;
  installedVersion: string;
  status: string;
}

interface ChangeRecord {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface RecordInstance {
  id: string;
  recordTypeId: string;
  data: Record<string, unknown>;
  createdAt: string;
}

interface RecordType {
  id: string;
  name: string;
  key: string;
}

export default function WorkspacePage() {
  const { data: apps, isLoading: appsLoading } = useQuery<AppSummary[]>({
    queryKey: ["/api/apps"],
  });

  const { data: changes, isLoading: changesLoading } = useQuery<ChangeRecord[]>({
    queryKey: ["/api/changes"],
  });

  const { data: recordTypes } = useQuery<RecordType[]>({
    queryKey: ["/api/record-types"],
  });

  const recentChanges = changes?.slice(0, 5) ?? [];

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your apps, changes, and activity at a glance.
        </p>
      </div>

      {/* Recently Used Apps */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" />
            Your Apps
          </h2>
          <Link href="/apps">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        {appsLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-56 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : !apps || apps.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <LayoutGrid className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No apps installed yet.</p>
              <Link href="/build/apps/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Create Your First App
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {apps.map((app) => (
              <Link key={app.id} href={`/apps/${app.appKey}`}>
                <Card className="w-56 shrink-0 cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold truncate">{app.displayName}</h3>
                      <Badge variant="default" className="text-[10px] shrink-0">
                        {app.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{app.appKey}</p>
                    <p className="text-xs text-muted-foreground mt-1">v{app.installedVersion}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
            <Link href="/build/apps/new">
              <Card className="w-56 shrink-0 cursor-pointer border-dashed hover:border-blue-300 transition-colors">
                <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[96px]">
                  <Plus className="w-5 h-5 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">Install New App</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Changes */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Active Changes
            </h2>
            <Link href="/changes">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {changesLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : recentChanges.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active changes.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {recentChanges.map((change) => (
                    <li key={change.id}>
                      <Link href={`/changes/${change.id}`}>
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{change.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(change.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          <Badge
                            variant={
                              change.status === "merged"
                                ? "default"
                                : change.status === "draft"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-[10px] shrink-0 ml-2"
                          >
                            {change.status}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Recent Records / SLA Alerts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Activity & Alerts
            </h2>
            <Link href="/records">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                Records <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Record Types summary */}
              {recordTypes && recordTypes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Record Types
                  </p>
                  {recordTypes.slice(0, 5).map((rt) => (
                    <div
                      key={rt.id}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm">{rt.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{rt.key}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <Clock className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No record activity yet.</p>
                </div>
              )}

              {/* SLA / Workflow Alerts — stub */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  SLA & Workflow Alerts
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground/50" />
                  <span>No alerts at this time.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
