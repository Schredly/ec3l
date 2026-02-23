import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status/StatusBadge";
import type { StatusTone } from "@/components/status/StatusBadge";
import { Database } from "lucide-react";
import type { RecordType } from "@shared/schema";

// --- Types ---

interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
  default?: unknown;
  reference?: string;
}

interface SlaConfig {
  durationMinutes?: number;
}

interface AssignmentConfig {
  strategy?: string;
  group?: string;
  field?: string;
  userId?: string;
}

// --- Tone helpers ---

function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "retired") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "retired") return "Retired";
  if (status === "draft") return "Draft";
  return status;
}

// --- Mini Graph ---

function MiniGraph({
  current,
  parent,
  children,
}: {
  current: string;
  parent: string | null;
  children: string[];
}) {
  if (!parent && children.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0">
      {/* Parent */}
      {parent && (
        <>
          <div className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-600">
            {parent}
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-300" />
        </>
      )}

      {/* Current */}
      <div className="px-3 py-1.5 rounded-md border-2 border-blue-500 bg-blue-50 text-xs font-mono font-semibold text-blue-700">
        {current}
      </div>

      {/* Children */}
      {children.length > 0 && (
        <>
          <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[5px] border-b-gray-300 mt-0" />
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-start gap-3 flex-wrap justify-center">
            {children.map((child) => (
              <div
                key={child}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-600"
              >
                {child}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Detail Panel ---

function DetailPanel({
  rt,
  allTypes,
}: {
  rt: RecordType;
  allTypes: RecordType[];
}) {
  const schema = rt.schema as { fields?: SchemaField[] } | null;
  const fields: SchemaField[] = schema?.fields ?? [];
  const sla = rt.slaConfig as SlaConfig | null;
  const assignment = rt.assignmentConfig as AssignmentConfig | null;

  // Infer children from the full list
  const childTypes = allTypes
    .filter((t) => t.baseType === rt.key && t.id !== rt.id)
    .map((t) => t.key);

  return (
    <div className="space-y-6">
      {/* Section 1 — Identity */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Identity
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Name</span>
            <p className="font-medium">{rt.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Key</span>
            <p className="font-mono text-xs">{rt.key}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Version</span>
            <p className="font-mono text-xs">v{rt.version}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Status</span>
            <div className="mt-0.5">
              <StatusBadge label={statusLabel(rt.status)} tone={statusTone(rt.status)} />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2 — Inheritance */}
      {(rt.baseType || childTypes.length > 0) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Inheritance
          </h3>
          <div className="space-y-1.5 text-sm">
            {rt.baseType && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Base type:</span>
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{rt.baseType}</span>
              </div>
            )}
            {childTypes.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground text-xs shrink-0 mt-0.5">Children:</span>
                <div className="flex flex-wrap gap-1.5">
                  {childTypes.map((c) => (
                    <span key={c} className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 3 — Fields */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Fields ({fields.length})
        </h3>
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No fields defined.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Name</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Type</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Required</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Default</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Reference</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.name} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-xs">{f.name}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{f.type}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {f.required ? "Yes" : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {f.default !== undefined && f.default !== null
                        ? String(f.default)
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {f.reference || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 4 — SLA + Assignment */}
      {(sla || assignment) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            SLA &amp; Assignment
          </h3>
          <div className="space-y-2 text-sm">
            {sla?.durationMinutes != null && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">SLA duration:</span>
                <span className="text-xs font-medium">
                  {sla.durationMinutes >= 1440
                    ? `${Math.floor(sla.durationMinutes / 1440)}d`
                    : sla.durationMinutes >= 60
                      ? `${Math.floor(sla.durationMinutes / 60)}h`
                      : `${sla.durationMinutes}m`}
                </span>
              </div>
            )}
            {assignment?.strategy && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Assignment:</span>
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                  {assignment.strategy}
                </span>
                {assignment.group && (
                  <span className="text-xs text-muted-foreground">
                    → {assignment.group}
                  </span>
                )}
                {assignment.userId && (
                  <span className="text-xs text-muted-foreground">
                    → {assignment.userId}
                  </span>
                )}
                {assignment.field && (
                  <span className="text-xs text-muted-foreground">
                    → field:{assignment.field}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 5 — Mini Graph */}
      {(rt.baseType || childTypes.length > 0) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Relationship Graph
          </h3>
          <div className="rounded-md border bg-gray-50/50 p-4 flex justify-center">
            <MiniGraph
              current={rt.key}
              parent={rt.baseType}
              children={childTypes}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Page ---

export default function Primitives() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: recordTypes, isLoading } = useQuery<RecordType[]>({
    queryKey: ["/api/record-types"],
  });

  const sorted = useMemo(() => {
    if (!recordTypes) return [];
    return [...recordTypes].sort((a, b) => a.name.localeCompare(b.name));
  }, [recordTypes]);

  const selected = sorted.find((rt) => rt.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Primitives</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schema architecture and record relationships
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !sorted || sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No record types</h3>
            <p className="text-sm text-muted-foreground">
              Record types will appear here when packages are installed
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left — Record Type List */}
          <div className="lg:w-[60%] shrink-0">
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Key</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Base Type</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Fields</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Ver</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((rt) => {
                    const schema = rt.schema as { fields?: SchemaField[] } | null;
                    const fieldCount = schema?.fields?.length ?? 0;
                    const isSelected = rt.id === selectedId;
                    return (
                      <tr
                        key={rt.id}
                        onClick={() => setSelectedId(rt.id)}
                        className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-blue-50"
                            : "hover:bg-muted/30"
                        }`}
                        data-testid={`rt-row-${rt.key}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-sm">{rt.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{rt.key}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {rt.baseType || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fieldCount}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">v{rt.version}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge label={statusLabel(rt.status)} tone={statusTone(rt.status)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right — Detail Panel */}
          <div className="lg:w-[40%] min-w-0">
            {selected ? (
              <div className="border rounded-md p-5">
                <DetailPanel rt={selected} allTypes={sorted} />
              </div>
            ) : (
              <div className="border rounded-md p-5 flex flex-col items-center justify-center text-muted-foreground py-16">
                <Database className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">Select a record type to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
