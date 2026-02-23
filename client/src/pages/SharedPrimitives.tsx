import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status/StatusBadge";
import type { StatusTone } from "@/components/status/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Users, Clock, Workflow } from "lucide-react";
import { useSharedPrimitives } from "@/hooks/useSharedPrimitives";
import type {
  SharedRole,
  SharedAssignmentRule,
  SharedSlaPolicy,
  SharedWorkflow,
} from "@/lib/api/primitives";

// --- Tone helpers ---

function roleTone(status: string): StatusTone {
  return status === "active" ? "success" : "neutral";
}

function workflowTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "retired") return "danger";
  return "neutral";
}

function rtStatusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "retired") return "danger";
  return "neutral";
}

function formatDuration(minutes: number): string {
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${minutes % 1440 > 0 ? `${Math.floor((minutes % 1440) / 60)}h` : ""}`.trim();
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}m` : ""}`.trim();
  return `${minutes}m`;
}

// --- Tab: Roles ---

function RolesTab({ roles }: { roles: SharedRole[] }) {
  if (roles.length === 0) {
    return <EmptyState icon={ShieldCheck} message="No roles defined in this tenant." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => (
        <Card key={role.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium">{role.name}</h3>
              <StatusBadge label={role.status === "active" ? "Active" : "Inactive"} tone={roleTone(role.status)} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Tenant
              </span>
            </div>
            {role.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{role.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Tab: Assignments ---

function AssignmentsTab({ rules }: { rules: SharedAssignmentRule[] }) {
  if (rules.length === 0) {
    return <EmptyState icon={Users} message="No assignment rules configured on any record type." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rules.map((rule) => (
        <Card key={rule.recordTypeKey}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium">{rule.recordTypeName}</h3>
              <StatusBadge label={rule.recordTypeStatus} tone={rtStatusTone(rule.recordTypeStatus)} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Tenant
              </span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Strategy:</span>
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{rule.strategyType}</span>
              </div>
              {rule.groupKey && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Group:</span>
                  <span className="font-mono">{rule.groupKey}</span>
                </div>
              )}
              {rule.field && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Field:</span>
                  <span className="font-mono">{rule.field}</span>
                </div>
              )}
              {rule.userId && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">User:</span>
                  <span className="font-mono">{rule.userId}</span>
                </div>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {rule.recordTypeKey}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Tab: SLAs ---

function SlasTab({ policies }: { policies: SharedSlaPolicy[] }) {
  if (policies.length === 0) {
    return <EmptyState icon={Clock} message="No SLA policies configured on any record type." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {policies.map((policy) => (
        <Card key={policy.recordTypeKey}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium">{policy.recordTypeName}</h3>
              <StatusBadge label={policy.recordTypeStatus} tone={rtStatusTone(policy.recordTypeStatus)} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Tenant
              </span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">{formatDuration(policy.durationMinutes)}</span>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {policy.recordTypeKey}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Tab: Workflows ---

function WorkflowsTab({ workflows }: { workflows: SharedWorkflow[] }) {
  if (workflows.length === 0) {
    return <EmptyState icon={Workflow} message="No workflow definitions in this tenant." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {workflows.map((wf) => (
        <Card key={wf.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium">{wf.name}</h3>
              <StatusBadge label={wf.status} tone={workflowTone(wf.status)} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Tenant
              </span>
            </div>
            {wf.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{wf.description}</p>
            )}
            <div className="text-[11px] text-muted-foreground">
              Created {new Date(wf.createdAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Empty state ---

function EmptyState({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Icon className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

// --- Main Page ---

export default function SharedPrimitives() {
  const { data, isLoading, isError, error } = useSharedPrimitives();
  const [tab, setTab] = useState("roles");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shared Enterprise Primitives</h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-600">
            Failed to load primitives: {error instanceof Error ? error.message : "Unknown error"}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { roles, assignmentRules, slaPolicies, workflows } = data!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shared Enterprise Primitives</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tenant-level roles, assignments, SLAs, and workflows shared across all applications.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="roles">Roles ({roles.length})</TabsTrigger>
          <TabsTrigger value="assignments">Assignments ({assignmentRules.length})</TabsTrigger>
          <TabsTrigger value="slas">SLAs ({slaPolicies.length})</TabsTrigger>
          <TabsTrigger value="workflows">Workflows ({workflows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <RolesTab roles={roles} />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <AssignmentsTab rules={assignmentRules} />
        </TabsContent>

        <TabsContent value="slas" className="mt-4">
          <SlasTab policies={slaPolicies} />
        </TabsContent>

        <TabsContent value="workflows" className="mt-4">
          <WorkflowsTab workflows={workflows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
