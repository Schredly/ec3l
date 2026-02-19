import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, User, Users, Timer, Play, ChevronRight } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RecordDetailPanel } from "@/components/record-detail-panel";
import type { RecordType, RecordInstance } from "@shared/schema";

type RecordInstanceWithSla = RecordInstance & {
  dueAt: string | null;
  slaStatus: string | null;
};

function AssignedCell({ assignedTo, assignedGroup }: { assignedTo: string | null; assignedGroup: string | null }) {
  if (assignedTo) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <User className="w-3 h-3" />
        {assignedTo}
      </Badge>
    );
  }
  if (assignedGroup) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Users className="w-3 h-3" />
        {assignedGroup}
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">Unassigned</span>;
}

function SlaStatusBadge({ slaStatus }: { slaStatus: string | null }) {
  if (!slaStatus) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (slaStatus === "breached") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <Timer className="w-3 h-3" />
        Breached
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 text-xs bg-green-600 hover:bg-green-700">
      <Timer className="w-3 h-3" />
      Pending
    </Badge>
  );
}

export default function Records() {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [selectedInstance, setSelectedInstance] = useState<RecordInstanceWithSla | null>(null);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const { data: recordTypes, isLoading: typesLoading } = useQuery<RecordType[]>({
    queryKey: ["/api/record-types"],
  });

  const { data: instances, isLoading: instancesLoading } = useQuery<RecordInstanceWithSla[]>({
    queryKey: [`/api/record-instances?recordTypeId=${selectedTypeId}`],
    enabled: !!selectedTypeId,
  });

  async function handleProcessTimers() {
    setProcessing(true);
    try {
      const res = await apiRequest("POST", "/api/timers/process");
      const { processedCount } = await res.json();
      toast({
        title: "Timers processed",
        description: `${processedCount} timer(s) marked as breached.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/record-instances?recordTypeId=${selectedTypeId}`] });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to process timers",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }

  const selectedRecordType = recordTypes?.find((rt) => rt.id === selectedTypeId);
  const recordTypeName = selectedRecordType ? `${selectedRecordType.name} (${selectedRecordType.key})` : "";

  if (selectedInstance) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <RecordDetailPanel
          instance={selectedInstance}
          recordTypeName={recordTypeName}
          onBack={() => setSelectedInstance(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Record Instances</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse record instances, assignment, and SLA status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleProcessTimers}
          disabled={processing}
          className="gap-2"
        >
          <Play className="w-4 h-4" />
          {processing ? "Processing…" : "Process Timers"}
        </Button>
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground block mb-1.5">Record Type</label>
        {typesLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <select
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
            data-testid="select-record-type"
          >
            <option value="">Select a record type…</option>
            {recordTypes?.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} ({rt.key})
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedTypeId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Database className="w-10 h-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-1">Select a record type</h3>
            <p className="text-sm text-muted-foreground">
              Choose a record type above to view its instances
            </p>
          </CardContent>
        </Card>
      ) : instancesLoading ? (
        <div className="space-y-1.5" data-testid="instances-loading">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : !instances || instances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Database className="w-10 h-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-1">No instances</h3>
            <p className="text-sm text-muted-foreground">
              No record instances found for this type
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden" data-testid="instances-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">ID</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Assigned</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">SLA Due</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">SLA Status</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created By</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {instances.map((instance) => (
                <tr
                  key={instance.id}
                  className="border-b last:border-b-0 cursor-pointer hover-elevate transition-colors"
                  data-testid={`instance-row-${instance.id}`}
                  onClick={() => setSelectedInstance(instance)}
                >
                  <td className="px-4 py-2.5 font-mono text-xs" title={instance.id}>
                    {instance.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2.5">
                    <AssignedCell
                      assignedTo={instance.assignedTo}
                      assignedGroup={instance.assignedGroup}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {instance.dueAt
                      ? format(new Date(instance.dueAt), "MMM d, HH:mm")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <SlaStatusBadge slaStatus={instance.slaStatus} />
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {instance.createdBy}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(instance.createdAt), { addSuffix: true })}
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
