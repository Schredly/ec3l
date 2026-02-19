import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, User, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { RecordType, RecordInstance } from "@shared/schema";

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

export default function Records() {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const { data: recordTypes, isLoading: typesLoading } = useQuery<RecordType[]>({
    queryKey: ["/api/record-types"],
  });

  const { data: instances, isLoading: instancesLoading } = useQuery<RecordInstance[]>({
    queryKey: [`/api/record-instances?recordTypeId=${selectedTypeId}`],
    enabled: !!selectedTypeId,
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Record Instances</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse record instances and assignment status
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground block mb-2">Record Type</label>
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
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Select a record type</h3>
            <p className="text-sm text-muted-foreground">
              Choose a record type above to view its instances
            </p>
          </CardContent>
        </Card>
      ) : instancesLoading ? (
        <div className="space-y-2" data-testid="instances-loading">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !instances || instances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="w-12 h-12 text-muted-foreground mb-4" />
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
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created By</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((instance) => (
                <tr
                  key={instance.id}
                  className="border-b last:border-b-0"
                  data-testid={`instance-row-${instance.id}`}
                >
                  <td className="px-4 py-2 font-mono text-xs" title={instance.id}>
                    {instance.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2">
                    <AssignedCell
                      assignedTo={instance.assignedTo}
                      assignedGroup={instance.assignedGroup}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {instance.createdBy}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(instance.createdAt), { addSuffix: true })}
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
