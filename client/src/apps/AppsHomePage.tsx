import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, ArrowRight } from "lucide-react";

interface InstalledAppSummary {
  id: string;
  appKey: string;
  displayName: string;
  installedVersion: string;
  status: string;
}

export default function AppsHomePage() {
  const { data: apps, isLoading } = useQuery<InstalledAppSummary[]>({
    queryKey: ["/api/apps"],
  });

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Installed applications for your workspace
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : !apps || apps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <LayoutGrid className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-medium mb-1">No apps installed</h3>
            <p className="text-sm text-muted-foreground">
              Install your first app from the Builder to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.appKey}`}>
              <Card className="cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/40 h-full">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">{app.displayName}</h3>
                      <Badge
                        variant={app.status === "installed" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {app.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{app.appKey}</p>
                    <p className="text-xs text-muted-foreground mt-1">v{app.installedVersion}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-3">
                    Open <ArrowRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
