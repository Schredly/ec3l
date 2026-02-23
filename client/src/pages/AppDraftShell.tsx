import { useState } from "react";
import { useParams } from "wouter";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppDraft } from "@/hooks/useAppDraft";
import { useRefineDraft } from "@/hooks/useRefineDraft";
import { useDraftVersions } from "@/hooks/useDraftVersions";
import { useDraftVersion } from "@/hooks/useDraftVersion";
import { useDraftDiff } from "@/hooks/useDraftDiff";
import { useDraftPreflight } from "@/hooks/useDraftPreflight";
import type { GraphPackageJson, BuilderDiffResult, BuilderDiffChange, PreflightCheck } from "@/lib/api/vibe";
import type { StatusTone } from "@/components/status/StatusBadge";

function EnvironmentPipeline({ active }: { active: "DEV" | "TEST" | "PROD" }) {
  const stages: { label: "DEV" | "TEST" | "PROD"; color: string; activeColor: string }[] = [
    { label: "DEV", color: "bg-gray-100 text-gray-500", activeColor: "bg-amber-100 text-amber-700 border-amber-300" },
    { label: "TEST", color: "bg-gray-100 text-gray-500", activeColor: "bg-blue-100 text-blue-700 border-blue-300" },
    { label: "PROD", color: "bg-gray-100 text-gray-500", activeColor: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  ];

  return (
    <div className="flex items-center gap-2">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-md border text-xs font-mono font-medium ${
              stage.label === active ? stage.activeColor : stage.color
            }`}
          >
            {stage.label}
          </div>
          {i < stages.length - 1 && (
            <span className="text-gray-300 text-xs">&rarr;</span>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Helpers ---

function humanizeKey(key: string): string {
  return key.replace(/^vibe\./, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const STATUS_TONE: Record<string, StatusTone> = {
  draft: "warning",
  previewed: "info",
  installed: "success",
  discarded: "neutral",
};

const REASON_LABEL: Record<string, string> = {
  create: "Created",
  refine: "Refined",
  patch: "Patched",
  restore: "Restored",
  create_variant: "Variant",
  adopt_variant: "Adopted",
};

// --- Refinement Panel ---

function RefinementPanel({ appId }: { appId: string }) {
  const [prompt, setPrompt] = useState("");
  const { toast } = useToast();
  const refine = useRefineDraft(appId);

  function handleRefine() {
    if (!prompt.trim()) return;
    refine.mutate(prompt.trim(), {
      onSuccess: (draft) => {
        const pkg = draft.package as unknown as GraphPackageJson;
        toast({
          title: "Draft updated",
          description: `Package ${pkg.packageKey} refined successfully.`,
        });
        setPrompt("");
      },
      onError: (err: Error) => {
        toast({ title: "Refinement failed", description: err.message, variant: "destructive" });
      },
    });
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Refine Draft
      </p>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='e.g. "add field priority to ticket", "add sla 120 on vendor", "rename to helpdesk"'
        className="min-h-[80px] resize-y text-sm"
      />
      <Button
        onClick={handleRefine}
        disabled={!prompt.trim() || refine.isPending}
        size="sm"
        className="w-full"
      >
        {refine.isPending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Refining...
          </>
        ) : (
          "Generate Refinement"
        )}
      </Button>
    </div>
  );
}

// --- Version History ---

function VersionHistoryPanel({ appId }: { appId: string }) {
  const { data: versions, isLoading } = useDraftVersions(appId);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return null;
  }

  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const latestVersion = sorted[0]!.versionNumber;

  return (
    <div className="border rounded-md p-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Version History
      </p>
      <div className="space-y-1">
        {sorted.map((v) => (
          <button
            key={v.versionNumber}
            type="button"
            onClick={() => setSelectedVersion(
              selectedVersion === v.versionNumber ? null : v.versionNumber,
            )}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left text-xs transition-colors ${
              selectedVersion === v.versionNumber
                ? "bg-blue-50 border border-blue-200"
                : "hover:bg-muted/50 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">v{v.versionNumber}</span>
              <span className="text-muted-foreground">
                {REASON_LABEL[v.reason] || v.reason}
              </span>
              {v.versionNumber === latestVersion && (
                <StatusBadge label="current" tone="success" size="sm" />
              )}
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="font-mono">{v.checksum.slice(0, 8)}</span>
              <span>{relativeTime(v.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedVersion !== null && (
        <VersionPreview appId={appId} version={selectedVersion} />
      )}
    </div>
  );
}

function VersionPreview({ appId, version }: { appId: string; version: number }) {
  const { data, isLoading } = useDraftVersion(appId, version);

  if (isLoading) {
    return (
      <div className="border-t pt-3 space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  if (!data) return null;

  const pkg = data.package as unknown as GraphPackageJson;
  const rules = pkg.assignmentRules ?? [];
  const roleCount = new Set(
    rules
      .map((r) => (r.config as Record<string, unknown> | undefined)?.groupKey)
      .filter((g): g is string => typeof g === "string"),
  ).size;

  return (
    <div className="border-t pt-3">
      <div className="grid grid-cols-4 gap-3">
        <MiniCount label="Record Types" count={pkg.recordTypes.length} />
        <MiniCount label="Workflows" count={pkg.workflows?.length ?? 0} />
        <MiniCount label="Roles" count={roleCount} />
        <MiniCount label="SLA Policies" count={pkg.slaPolicies?.length ?? 0} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        <span className="font-mono">{pkg.packageKey}</span>
        {" v"}
        {pkg.version}
        {data.createdBy && (
          <span> by {data.createdBy}</span>
        )}
      </div>
    </div>
  );
}

function MiniCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{count}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// --- Compare Versions ---

function CompareVersionsPanel({ appId }: { appId: string }) {
  const { data: versions, isLoading: versionsLoading } = useDraftVersions(appId);
  const [fromVersion, setFromVersion] = useState<number | null>(null);
  const [toVersion, setToVersion] = useState<number | null>(null);
  const [compareTriggered, setCompareTriggered] = useState(false);

  const canCompare = fromVersion !== null && toVersion !== null && fromVersion !== toVersion;
  const { data: diff, isLoading: diffLoading, isError, error } = useDraftDiff(
    appId,
    compareTriggered ? fromVersion : null,
    compareTriggered ? toVersion : null,
  );

  if (versionsLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!versions || versions.length < 2) {
    return null;
  }

  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);

  function handleCompare() {
    setCompareTriggered(true);
  }

  function handleVersionChange(which: "from" | "to", value: string) {
    const num = parseInt(value, 10);
    if (which === "from") {
      setFromVersion(num);
    } else {
      setToVersion(num);
    }
    setCompareTriggered(false);
  }

  return (
    <div className="border rounded-md p-4 space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Compare Versions
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Select
            value={fromVersion?.toString() ?? ""}
            onValueChange={(v) => handleVersionChange("from", v)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((v) => (
                <SelectItem key={v.versionNumber} value={v.versionNumber.toString()}>
                  v{v.versionNumber} — {REASON_LABEL[v.reason] || v.reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Select
            value={toVersion?.toString() ?? ""}
            onValueChange={(v) => handleVersionChange("to", v)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((v) => (
                <SelectItem key={v.versionNumber} value={v.versionNumber.toString()}>
                  v{v.versionNumber} — {REASON_LABEL[v.reason] || v.reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleCompare}
          disabled={!canCompare || diffLoading}
          size="sm"
          variant="outline"
        >
          {diffLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Comparing...
            </>
          ) : (
            "Compare"
          )}
        </Button>
      </div>

      {isError && (
        <div className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error instanceof Error ? error.message : "Diff failed"}
        </div>
      )}

      {diff && compareTriggered && <DiffDisplay diff={diff} />}
    </div>
  );
}

function DiffDisplay({ diff }: { diff: BuilderDiffResult }) {
  const { summary, changes } = diff;
  const [expandedSection, setExpandedSection] = useState<"added" | "removed" | "modified" | null>(null);

  const totalAdded = summary.recordTypesAdded + summary.workflowsAdded + summary.slasAdded + summary.assignmentsAdded;
  const totalRemoved = summary.recordTypesRemoved + summary.workflowsRemoved + summary.slasRemoved + summary.assignmentsRemoved;
  const totalModified = summary.recordTypesModified;

  if (totalAdded === 0 && totalRemoved === 0 && totalModified === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4 border-t">
        No structural changes between v{diff.fromVersion} and v{diff.toVersion}.
      </div>
    );
  }

  return (
    <div className="border-t pt-4 space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Diff Summary — v{diff.fromVersion} → v{diff.toVersion}
      </p>

      {/* Summary Grid */}
      <div className="grid grid-cols-5 gap-2 text-xs">
        <DiffSummaryCell label="Record Types" added={summary.recordTypesAdded} removed={summary.recordTypesRemoved} modified={summary.recordTypesModified} />
        <DiffSummaryCell label="Workflows" added={summary.workflowsAdded} removed={summary.workflowsRemoved} modified={0} />
        <DiffSummaryCell label="SLA Policies" added={summary.slasAdded} removed={summary.slasRemoved} modified={0} />
        <DiffSummaryCell label="Assignments" added={summary.assignmentsAdded} removed={summary.assignmentsRemoved} modified={0} />
        <div className="border rounded-md p-2 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">Total</p>
          <div className="flex justify-center gap-2">
            {totalAdded > 0 && <span className="text-emerald-600 font-medium">+{totalAdded}</span>}
            {totalRemoved > 0 && <span className="text-red-600 font-medium">-{totalRemoved}</span>}
            {totalModified > 0 && <span className="text-amber-600 font-medium">~{totalModified}</span>}
          </div>
        </div>
      </div>

      {/* Expandable Change Lists */}
      {changes.added.length > 0 && (
        <DiffChangeSection
          label="Added"
          tone="emerald"
          items={changes.added}
          expanded={expandedSection === "added"}
          onToggle={() => setExpandedSection(expandedSection === "added" ? null : "added")}
        />
      )}
      {changes.removed.length > 0 && (
        <DiffChangeSection
          label="Removed"
          tone="red"
          items={changes.removed}
          expanded={expandedSection === "removed"}
          onToggle={() => setExpandedSection(expandedSection === "removed" ? null : "removed")}
        />
      )}
      {changes.modified.length > 0 && (
        <DiffChangeSection
          label="Modified"
          tone="amber"
          items={changes.modified}
          expanded={expandedSection === "modified"}
          onToggle={() => setExpandedSection(expandedSection === "modified" ? null : "modified")}
        />
      )}
    </div>
  );
}

function DiffSummaryCell({ label, added, removed, modified }: {
  label: string;
  added: number;
  removed: number;
  modified: number;
}) {
  const hasChanges = added > 0 || removed > 0 || modified > 0;
  return (
    <div className="border rounded-md p-2 text-center">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      {hasChanges ? (
        <div className="flex justify-center gap-1.5">
          {added > 0 && <span className="text-emerald-600 font-medium">+{added}</span>}
          {removed > 0 && <span className="text-red-600 font-medium">-{removed}</span>}
          {modified > 0 && <span className="text-amber-600 font-medium">~{modified}</span>}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}

function DiffChangeSection({ label, tone, items, expanded, onToggle }: {
  label: string;
  tone: "emerald" | "red" | "amber";
  items: BuilderDiffChange[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const colorMap = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  };
  const c = colorMap[tone];

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${c.bg} ${c.border} border ${c.text}`}
      >
        <span>{label} ({items.length})</span>
        <span>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 pl-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${c.dot}`} />
              <div>
                <span className="text-muted-foreground">{item.category}:</span>{" "}
                <span className="font-mono">{item.key}</span>
                {item.details && item.details.length > 0 && (
                  <div className="mt-0.5 pl-2 text-[11px] text-muted-foreground space-y-0.5">
                    {item.details.map((d, j) => (
                      <div key={j} className="font-mono">{d}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Tab Content Components ---

function OverviewTab({ pkg, prompt, status, createdAt, appId }: {
  pkg: GraphPackageJson;
  prompt: string;
  status: string;
  createdAt: string;
  appId: string;
}) {
  return (
    <div className="mt-2 space-y-4">
      <div className="border rounded-md p-6 space-y-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">App Name</span>
            <p className="font-medium">{humanizeKey(pkg.packageKey)}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Environment</span>
            <p className="font-medium">DEV</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Status</span>
            <p className="font-medium capitalize">{status}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Created</span>
            <p className="font-medium">{new Date(createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Package Version</span>
            <p className="font-medium font-mono text-xs">{pkg.version}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Package Key</span>
            <p className="font-medium font-mono text-xs">{pkg.packageKey}</p>
          </div>
        </div>

        <div>
          <span className="text-xs text-muted-foreground">Latest Prompt</span>
          <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 rounded-md p-3">{prompt}</p>
        </div>

        <div>
          <span className="text-xs text-muted-foreground block mb-2">Summary</span>
          <div className="flex gap-3 flex-wrap">
            <CountBadge label="Record Types" count={pkg.recordTypes.length} />
            <CountBadge label="Workflows" count={pkg.workflows?.length ?? 0} />
            <CountBadge label="SLA Policies" count={pkg.slaPolicies?.length ?? 0} />
            <CountBadge label="Assignment Rules" count={pkg.assignmentRules?.length ?? 0} />
          </div>
        </div>
      </div>

      <RefinementPanel appId={appId} />
      <VersionHistoryPanel appId={appId} />
      <CompareVersionsPanel appId={appId} />
    </div>
  );
}

function CountBadge({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border rounded-md px-3 py-2">
      <span className="text-lg font-semibold">{count}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function DataModelTab({ pkg }: { pkg: GraphPackageJson }) {
  if (pkg.recordTypes.length === 0) {
    return <EmptyState message="No record types defined." />;
  }

  return (
    <div className="space-y-3 mt-2">
      {pkg.recordTypes.map((rt) => (
        <Card key={rt.key}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium">{rt.name || humanizeKey(rt.key)}</p>
                <p className="text-xs text-muted-foreground font-mono">{rt.key}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {rt.fields.length} field{rt.fields.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="border-t pt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1 pr-4">Field</th>
                    <th className="text-left font-medium py-1 pr-4">Type</th>
                    <th className="text-left font-medium py-1">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {rt.fields.map((f) => (
                    <tr key={f.name} className="border-t border-dashed">
                      <td className="py-1 pr-4 font-mono">{f.name}</td>
                      <td className="py-1 pr-4 text-muted-foreground">{f.type}</td>
                      <td className="py-1">{f.required ? "Yes" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WorkflowsTab({ pkg }: { pkg: GraphPackageJson }) {
  const workflows = pkg.workflows ?? [];
  if (workflows.length === 0) {
    return <EmptyState message="No workflows defined." />;
  }

  return (
    <div className="space-y-3 mt-2">
      {workflows.map((wf) => (
        <Card key={wf.key}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">{wf.name}</p>
              <span className="text-xs text-muted-foreground font-mono">{wf.key}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Trigger: <span className="font-mono">{wf.triggerEvent || "manual"}</span>
              {" on "}
              <span className="font-mono">{wf.recordTypeKey}</span>
            </p>
            {wf.steps && wf.steps.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                {wf.steps
                  .slice()
                  .sort((a, b) => a.ordering - b.ordering)
                  .map((step) => (
                    <div key={step.ordering} className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                        {step.ordering}
                      </span>
                      <span>{step.name}</span>
                      <span className="text-muted-foreground font-mono ml-auto">{step.stepType}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RolesTab({ pkg }: { pkg: GraphPackageJson }) {
  const rules = pkg.assignmentRules ?? [];
  const slas = pkg.slaPolicies ?? [];

  if (rules.length === 0 && slas.length === 0) {
    return <EmptyState message="No assignment rules or SLA policies defined." />;
  }

  return (
    <div className="space-y-4 mt-2">
      {rules.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Assignment Rules
          </p>
          <div className="space-y-2">
            {rules.map((rule, i) => {
              const group = (rule.config as Record<string, unknown> | undefined)?.groupKey;
              return (
                <Card key={i}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium font-mono">{rule.recordTypeKey}</p>
                      <p className="text-xs text-muted-foreground">
                        Strategy: {rule.strategyType}
                        {typeof group === "string" && ` \u2192 ${group}`}
                      </p>
                    </div>
                    {typeof group === "string" && (
                      <StatusBadge label={group.replace(/_/g, " ")} tone="info" size="sm" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {slas.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            SLA Policies
          </p>
          <div className="space-y-2">
            {slas.map((sla, i) => {
              const hours = Math.round(sla.durationMinutes / 60);
              const rtName = pkg.recordTypes.find((r) => r.key === sla.recordTypeKey)?.name || sla.recordTypeKey;
              return (
                <Card key={i}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <p className="text-sm">{rtName}</p>
                    <span className="text-xs font-mono text-muted-foreground">
                      {hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`} response
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangesTab({ status, createdAt, checksum, createdBy }: {
  status: string;
  createdAt: string;
  checksum: string;
  createdBy: string | null;
}) {
  return (
    <div className="mt-2">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Draft Created</p>
            <StatusBadge label={status} tone={STATUS_TONE[status] ?? "neutral"} size="sm" />
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Created At</span>
              <p className="font-medium">{new Date(createdAt).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created By</span>
              <p className="font-medium">{createdBy || "system"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Checksum</span>
              <p className="font-mono truncate">{checksum}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Preflight Tab ---

const PREFLIGHT_TYPE_LABEL: Record<string, string> = {
  recordType: "Record Types",
  workflow: "Workflows",
  sla: "SLA Policies",
  assignment: "Assignment Rules",
  rbac: "RBAC / Roles",
};

function PreflightTab({ appId }: { appId: string }) {
  const [triggered, setTriggered] = useState(false);
  const { data, isLoading, isError, error, refetch } = useDraftPreflight(appId, triggered);

  function handleRun() {
    if (triggered) {
      refetch();
    } else {
      setTriggered(true);
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={handleRun} disabled={isLoading} size="sm">
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Running...
            </>
          ) : (
            "Run Preflight"
          )}
        </Button>
        {!triggered && (
          <span className="text-xs text-muted-foreground">
            Run structural validation to check this draft before promotion.
          </span>
        )}
      </div>

      {isError && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error instanceof Error ? error.message : "Preflight failed"}
        </div>
      )}

      {data && <PreflightResults result={data} />}
    </div>
  );
}

function PreflightResults({ result }: { result: { status: string; summary: { errors: number; warnings: number }; checks: PreflightCheck[] } }) {
  const bannerConfig = {
    ready: { bg: "bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, text: "text-emerald-800", label: "Ready for promotion" },
    warning: { bg: "bg-amber-50 border-amber-200", icon: <TriangleAlert className="w-5 h-5 text-amber-600" />, text: "text-amber-800", label: `${result.summary.warnings} warning${result.summary.warnings !== 1 ? "s" : ""} found` },
    error: { bg: "bg-red-50 border-red-200", icon: <ShieldAlert className="w-5 h-5 text-red-600" />, text: "text-red-800", label: `${result.summary.errors} error${result.summary.errors !== 1 ? "s" : ""}${result.summary.warnings > 0 ? `, ${result.summary.warnings} warning${result.summary.warnings !== 1 ? "s" : ""}` : ""}` },
  };
  const banner = bannerConfig[result.status as keyof typeof bannerConfig] ?? bannerConfig.error;

  // Group checks by type
  const grouped = new Map<string, PreflightCheck[]>();
  for (const check of result.checks) {
    const list = grouped.get(check.type) ?? [];
    list.push(check);
    grouped.set(check.type, list);
  }

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-md border ${banner.bg}`}>
        {banner.icon}
        <span className={`text-sm font-medium ${banner.text}`}>{banner.label}</span>
      </div>

      {result.checks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          All validation checks passed. This draft is structurally ready for promotion.
        </p>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([type, checks]) => (
            <Card key={type}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  {PREFLIGHT_TYPE_LABEL[type] ?? type}
                </p>
                <div className="space-y-1.5">
                  {checks.map((check, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <StatusBadge
                        label={check.severity}
                        tone={check.severity === "error" ? "danger" : "warning"}
                        size="sm"
                      />
                      <span className="font-mono text-muted-foreground shrink-0">{check.entity}</span>
                      <span>{check.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm mt-2">
      {message}
    </div>
  );
}

// --- Loading Skeleton ---

function DraftSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-8 w-96" />
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}

// --- Main Component ---

export default function AppDraftShell() {
  const { appId } = useParams<{ appId: string }>();
  const { data: draft, isLoading, isError, error } = useAppDraft(appId);

  if (isLoading) {
    return <DraftSkeleton />;
  }

  if (isError || !draft) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm font-medium">Failed to load draft</p>
        <p className="text-xs text-muted-foreground max-w-md text-center">
          {error instanceof Error ? error.message : "Draft not found"}
        </p>
      </div>
    );
  }

  const pkg = draft.package as unknown as GraphPackageJson;
  const appName = humanizeKey(pkg.packageKey);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{appName}</h1>
          <StatusBadge
            label={draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
            tone={STATUS_TONE[draft.status] ?? "neutral"}
            size="md"
          />
          <StatusBadge label="DEV" tone="info" size="md" />
        </div>
      </div>

      {/* Environment pipeline */}
      <EnvironmentPipeline active="DEV" />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data-model">
            Data Model
            <span className="ml-1 text-xs text-muted-foreground">({pkg.recordTypes.length})</span>
          </TabsTrigger>
          <TabsTrigger value="workflows">
            Workflows
            <span className="ml-1 text-xs text-muted-foreground">({pkg.workflows?.length ?? 0})</span>
          </TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; Access</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="preflight">Preflight</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            pkg={pkg}
            prompt={draft.prompt}
            status={draft.status}
            createdAt={draft.createdAt}
            appId={appId!}
          />
        </TabsContent>

        <TabsContent value="data-model">
          <DataModelTab pkg={pkg} />
        </TabsContent>

        <TabsContent value="workflows">
          <WorkflowsTab pkg={pkg} />
        </TabsContent>

        <TabsContent value="roles">
          <RolesTab pkg={pkg} />
        </TabsContent>

        <TabsContent value="changes">
          <ChangesTab
            status={draft.status}
            createdAt={draft.createdAt}
            checksum={draft.checksum}
            createdBy={draft.createdBy}
          />
        </TabsContent>

        <TabsContent value="preflight">
          <PreflightTab appId={appId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
