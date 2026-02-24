import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Database, User, Users, Play, ChevronRight, Plus, Loader2 } from "lucide-react";
import { SlaStatusBadge } from "@/components/status/SlaStatusBadge";
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

interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
}

function CreateRecordDialog({
  open,
  onOpenChange,
  recordType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: RecordType;
}) {
  const { toast } = useToast();
  const schema = recordType.schema as { fields?: SchemaField[] } | null;
  const fields: SchemaField[] = schema?.fields ?? [];

  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Reset form when dialog opens or record type changes
  useEffect(() => {
    if (open) {
      const initial: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.type === "boolean") initial[field.name] = false;
        else if (field.type === "number") initial[field.name] = "";
        else initial[field.name] = "";
      }
      setFormData(initial);
    }
  }, [open, recordType.id]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/record-instances", {
        recordTypeId: recordType.id,
        data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/record-instances?recordTypeId=${recordType.id}`],
      });
      toast({ title: "Record created", description: `New ${recordType.name} record created.` });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create record", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Build cleaned data — convert number fields, strip empty strings
    const cleaned: Record<string, unknown> = {};
    for (const field of fields) {
      const value = formData[field.name];
      if (field.type === "number") {
        const num = Number(value);
        if (value !== "" && !isNaN(num)) cleaned[field.name] = num;
      } else if (field.type === "boolean") {
        cleaned[field.name] = value;
      } else {
        if (typeof value === "string" && value.trim() !== "") {
          cleaned[field.name] = value.trim();
        }
      }
    }
    createMutation.mutate(cleaned);
  }

  function updateField(name: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New {recordType.name} Record</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This record type has no fields defined.
            </p>
          ) : (
            fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`field-${field.name}`} className="text-sm">
                  {field.name}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                  <span className="text-xs text-muted-foreground ml-2">({field.type})</span>
                </Label>
                {field.type === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`field-${field.name}`}
                      checked={formData[field.name] === true}
                      onCheckedChange={(checked) => updateField(field.name, checked)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {formData[field.name] ? "True" : "False"}
                    </span>
                  </div>
                ) : field.type === "text" ? (
                  <Textarea
                    id={`field-${field.name}`}
                    value={(formData[field.name] as string) ?? ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    placeholder={`Enter ${field.name}...`}
                    className="min-h-[80px] text-sm"
                    required={field.required}
                  />
                ) : field.type === "number" ? (
                  <Input
                    id={`field-${field.name}`}
                    type="number"
                    value={(formData[field.name] as string) ?? ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    placeholder={`Enter ${field.name}...`}
                    required={field.required}
                  />
                ) : field.type === "date" ? (
                  <Input
                    id={`field-${field.name}`}
                    type="date"
                    value={(formData[field.name] as string) ?? ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    required={field.required}
                  />
                ) : field.type === "datetime" ? (
                  <Input
                    id={`field-${field.name}`}
                    type="datetime-local"
                    value={(formData[field.name] as string) ?? ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    required={field.required}
                  />
                ) : (
                  // string, reference, choice — all rendered as text input
                  <Input
                    id={`field-${field.name}`}
                    type="text"
                    value={(formData[field.name] as string) ?? ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    placeholder={`Enter ${field.name}...`}
                    required={field.required}
                  />
                )}
              </div>
            ))
          )}
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating...</>
            ) : (
              "Create Record"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Records() {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [selectedInstance, setSelectedInstance] = useState<RecordInstanceWithSla | null>(null);
  const [processing, setProcessing] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: recordTypes, isLoading: typesLoading } = useQuery<RecordType[]>({
    queryKey: ["/api/record-types"],
  });

  useEffect(() => {
    if (!selectedTypeId && recordTypes && recordTypes.length > 0) {
      setSelectedTypeId(recordTypes[0].id);
    }
  }, [recordTypes, selectedTypeId]);

  const { data: instances, isLoading: instancesLoading } = useQuery<RecordInstanceWithSla[]>({
    queryKey: [`/api/record-instances?recordTypeId=${selectedTypeId}`],
    enabled: !!selectedTypeId,
  });

  useEffect(() => {
    if (selectedTypeId && instances && instances.length === 0) {
      console.warn(`[records] No instances returned for recordTypeId=${selectedTypeId}`);
    }
  }, [instances, selectedTypeId]);

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

      <div className="flex items-end gap-3">
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
        <Button
          size="sm"
          disabled={!selectedTypeId}
          onClick={() => setCreateDialogOpen(true)}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          New Record
        </Button>
      </div>

      {selectedRecordType && (
        <CreateRecordDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          recordType={selectedRecordType}
        />
      )}

      {!selectedTypeId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16" data-testid="empty-no-type">
            <Database className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-medium mb-1">No record type selected</h3>
            <p className="text-sm text-muted-foreground">
              Choose a record type from the dropdown to browse instances
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
          <CardContent className="flex flex-col items-center justify-center py-16" data-testid="empty-no-instances">
            <Database className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-medium mb-1">No records found</h3>
            <p className="text-sm text-muted-foreground">
              {recordTypeName
                ? `No instances exist for ${recordTypeName}`
                : "No record instances found for this type"}
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
                    <SlaStatusBadge status={instance.slaStatus} />
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
