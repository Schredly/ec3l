import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IntentStatusBadge } from "@/components/status-badge";
import { Activity, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { WorkflowExecutionIntent } from "@shared/schema";

export default function WorkflowMonitor() {
  const { data: intents, isLoading } = useQuery<WorkflowExecutionIntent[]>({
    queryKey: ["/api/workflow-intents"],
    refetchInterval: 5000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/workflow-intents"] });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflow Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Execution intents and lifecycle transitions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-intents">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2" data-testid="intents-loading">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !intents || intents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Activity className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No execution intents</h3>
            <p className="text-sm text-muted-foreground">
              Workflow intents will appear here when triggers fire
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden" data-testid="intents-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Intent ID</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Workflow ID</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Record ID</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Error</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((intent) => {
                const payload = intent.triggerPayload as Record<string, unknown> | null;
                const recordId = payload?.recordId as string | undefined;
                return (
                  <tr
                    key={intent.id}
                    className="border-b last:border-b-0"
                    data-testid={`intent-row-${intent.id}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs" title={intent.id}>
                      {intent.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs" title={intent.workflowDefinitionId}>
                      {intent.workflowDefinitionId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2">
                      <IntentStatusBadge status={intent.status} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs" title={recordId}>
                      {recordId ? recordId.slice(0, 8) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(intent.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2 text-xs text-destructive max-w-[200px] truncate" title={intent.error ?? undefined}>
                      {intent.error || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
