import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Database, ChevronRight, Search } from "lucide-react";
import { useRbacContext } from "@/hooks/useRbacContext";
import { formatDistanceToNow } from "date-fns";
import type { RecordType, RecordInstance } from "@shared/schema";

interface AppSummary {
  id: string;
  appKey: string;
  displayName: string;
  installedVersion: string;
  status: string;
}

export default function RecordListPage() {
  const { appKey, recordTypeKey } = useParams<{ appKey: string; recordTypeKey: string }>();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const rbac = useRbacContext();
  const canCreate = rbac.isLoading || rbac.isAdmin || rbac.canEditForm;

  // Fetch app info for contextual header
  const { data: app } = useQuery<AppSummary>({
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

  const { data: instances, isLoading: instancesLoading } = useQuery<RecordInstance[]>({
    queryKey: [`/api/record-instances?recordTypeId=${recordType?.id}`],
    enabled: !!recordType?.id,
  });

  const schema = recordType?.schema as { fields?: { name: string; type: string }[] } | null;
  const fields = schema?.fields ?? [];
  const displayFields = fields.slice(0, 4);

  const recordTypeName = recordType?.name ?? recordTypeKey;
  const appDisplayName = app?.displayName;

  const filtered = instances?.filter((inst) => {
    if (!search.trim()) return true;
    const data = inst.data as Record<string, unknown>;
    return Object.values(data).some(
      (v) => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase()),
    );
  });

  if (rtLoading) {
    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Header — contextualized to app */}
      <div className="flex items-center gap-3">
        <Link href={`/apps/${appKey}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {appDisplayName ? `${appDisplayName} — ${recordTypeName}` : recordTypeName}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{recordTypeKey}</p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => navigate(`/apps/${appKey}/records/${recordTypeKey}/new`)}
          >
            <Plus className="w-3.5 h-3.5" />
            New {recordTypeName}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${recordTypeName.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {instancesLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="w-10 h-10 text-muted-foreground/50 mb-3" />
            {search ? (
              <>
                <h3 className="text-lg font-medium mb-1">No results</h3>
                <p className="text-sm text-muted-foreground">
                  No {recordTypeName.toLowerCase()} match your search.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-1">No {recordTypeName} yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Get started by creating your first record.
                </p>
                {canCreate && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigate(`/apps/${appKey}/records/${recordTypeKey}/new`)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First {recordTypeName}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">ID</th>
                {displayFields.map((f) => (
                  <th key={f.name} className="text-left px-4 py-2 font-medium text-muted-foreground">
                    {f.name}
                  </th>
                ))}
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((inst) => {
                const data = inst.data as Record<string, unknown>;
                return (
                  <tr
                    key={inst.id}
                    className="border-b last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/apps/${appKey}/records/${recordTypeKey}/${inst.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs" title={inst.id}>
                      {inst.id.slice(0, 8)}
                    </td>
                    {displayFields.map((f) => (
                      <td key={f.name} className="px-4 py-2.5 text-xs max-w-[200px] truncate">
                        {data[f.name] != null ? String(data[f.name]) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(inst.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
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
