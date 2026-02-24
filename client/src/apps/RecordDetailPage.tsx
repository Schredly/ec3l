import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useRbacContext } from "@/hooks/useRbacContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RecordType, RecordInstance } from "@shared/schema";

interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
}

export default function RecordDetailPage() {
  const { appKey, recordTypeKey, id } = useParams<{
    appKey: string;
    recordTypeKey: string;
    id: string;
  }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const rbac = useRbacContext();
  const canEdit = rbac.isLoading || rbac.isAdmin || rbac.canEditForm;
  const isCreateMode = id === "new";

  const { data: recordType, isLoading: rtLoading } = useQuery<RecordType>({
    queryKey: ["/api/record-types/by-key", recordTypeKey],
    queryFn: async () => {
      const res = await fetch(`/api/record-types/by-key/${recordTypeKey}`, {
        headers: {
          "x-tenant-id": localStorage.getItem("tenantId") || "default",
          "x-user-id": localStorage.getItem("userId") || "user-admin",
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!recordTypeKey,
  });

  const { data: instance, isLoading: instanceLoading } = useQuery<RecordInstance>({
    queryKey: ["/api/record-instances", id],
    queryFn: async () => {
      const res = await fetch(`/api/record-instances/${id}`, {
        headers: {
          "x-tenant-id": localStorage.getItem("tenantId") || "default",
          "x-user-id": localStorage.getItem("userId") || "user-admin",
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !isCreateMode && !!id,
  });

  const schema = recordType?.schema as { fields?: SchemaField[] } | null;
  const fields: SchemaField[] = schema?.fields ?? [];

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isCreateMode) {
      const initial: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.type === "boolean") initial[field.name] = false;
        else initial[field.name] = "";
      }
      setFormData(initial);
      setDirty(false);
    } else if (instance) {
      setFormData((instance.data as Record<string, unknown>) ?? {});
      setDirty(false);
    }
  }, [isCreateMode, instance, recordType?.id]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/record-instances", {
        recordTypeId: recordType!.id,
        data,
      });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/record-instances?recordTypeId=${recordType!.id}`],
      });
      toast({ title: "Record created", description: `New ${recordType?.name} record created.` });
      navigate(`/apps/${appKey}/records/${recordTypeKey}/${result.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create record", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/record-instances/${id}`, { data });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/record-instances", id] });
      queryClient.invalidateQueries({
        queryKey: [`/api/record-instances?recordTypeId=${recordType!.id}`],
      });
      toast({ title: "Record saved" });
      setDirty(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  function buildCleanedData(): Record<string, unknown> {
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
    return cleaned;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = buildCleanedData();
    if (isCreateMode) {
      createMutation.mutate(cleaned);
    } else {
      updateMutation.mutate(cleaned);
    }
  }

  function updateField(name: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
  }

  const isLoading = rtLoading || (!isCreateMode && instanceLoading);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/apps/${appKey}/records/${recordTypeKey}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isCreateMode ? `New ${recordType?.name}` : recordType?.name}
          </h1>
          {!isCreateMode && (
            <p className="text-xs text-muted-foreground font-mono">{id}</p>
          )}
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="p-6">
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
                        disabled={!canEdit}
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
                      disabled={!canEdit}
                    />
                  ) : field.type === "number" ? (
                    <Input
                      id={`field-${field.name}`}
                      type="number"
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => updateField(field.name, e.target.value)}
                      placeholder={`Enter ${field.name}...`}
                      required={field.required}
                      disabled={!canEdit}
                    />
                  ) : field.type === "date" ? (
                    <Input
                      id={`field-${field.name}`}
                      type="date"
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => updateField(field.name, e.target.value)}
                      required={field.required}
                      disabled={!canEdit}
                    />
                  ) : field.type === "datetime" ? (
                    <Input
                      id={`field-${field.name}`}
                      type="datetime-local"
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => updateField(field.name, e.target.value)}
                      required={field.required}
                      disabled={!canEdit}
                    />
                  ) : (
                    <Input
                      id={`field-${field.name}`}
                      type="text"
                      value={(formData[field.name] as string) ?? ""}
                      onChange={(e) => updateField(field.name, e.target.value)}
                      placeholder={`Enter ${field.name}...`}
                      required={field.required}
                      disabled={!canEdit}
                    />
                  )}
                </div>
              ))
            )}

            {canEdit && (
              <Button
                type="submit"
                disabled={isSaving || (!isCreateMode && !dirty)}
                className="w-full gap-1.5"
              >
                {isSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />{isCreateMode ? "Creating..." : "Saving..."}</>
                ) : (
                  <><Save className="w-3.5 h-3.5" />{isCreateMode ? "Create Record" : "Save Changes"}</>
                )}
              </Button>
            )}

            {!canEdit && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Read-only — you need Editor or Admin role to edit records.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
