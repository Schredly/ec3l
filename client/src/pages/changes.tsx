import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/status/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GitPullRequestArrow,
  Clock,
  ArrowRightLeft,
  FileCode2,
  Download,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Pencil,
  Rocket,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useTimeline } from "@/hooks/useTimeline";
import { useDraftPreflight } from "@/hooks/useDraftPreflight";
import { useCreatePromotionIntent } from "@/hooks/useCreatePromotionIntent";
import type { TimelineEntry, TimelineEntryType, DiffSummary } from "@/lib/api/timeline";

const TYPE_CONFIG: Record<TimelineEntryType, { label: string; tone: StatusTone; color: string }> = {
  change: { label: "Change", tone: "info", color: "border-l-blue-400" },
  draft: { label: "Draft", tone: "info", color: "border-l-blue-400" },
  "promotion-intent": { label: "Promotion", tone: "warning", color: "border-l-amber-400" },
  "pull-down": { label: "Pull Down", tone: "ai", color: "border-l-violet-400" },
};

function statusTone(status?: string): StatusTone {
  if (!status) return "neutral";
  const s = status.toLowerCase();
  if (["merged", "installed", "executed", "approved"].includes(s)) return "success";
  if (["draft", "previewed"].includes(s)) return "info";
  if (["rejected", "validationfailed", "discarded"].includes(s)) return "danger";
  if (["implementing", "workspacerunning", "validating", "ready"].includes(s)) return "warning";
  return "neutral";
}

function EnvBadge({ env }: { env: string }) {
  const toneMap: Record<string, string> = {
    dev: "bg-amber-50 text-amber-700 border-amber-200",
    test: "bg-blue-50 text-blue-700 border-blue-200",
    prod: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const cls = toneMap[env.toLowerCase()] || "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-medium ${cls}`}>
      {env.toUpperCase()}
    </span>
  );
}

function DiffCountChip({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600" title={label}>
      {icon}
      {count}
    </span>
  );
}

function DiffSummaryGrid({ summary, fromLabel, toLabel }: { summary: DiffSummary; fromLabel?: string; toLabel?: string }) {
  const sections = [
    { label: "Record Types", data: summary.recordTypes },
    { label: "Workflows", data: summary.workflows },
    { label: "SLA Policies", data: summary.slaPolicies },
    { label: "Assignment Rules", data: summary.assignmentRules },
  ];

  const hasChanges = sections.some((s) => s.data.added > 0 || s.data.removed > 0 || ("modified" in s.data && (s.data as { modified?: number }).modified));

  if (!hasChanges) {
    return <p className="text-xs text-muted-foreground italic">No schema changes detected</p>;
  }

  return (
    <div className="space-y-2">
      {fromLabel && toLabel && (
        <p className="text-[11px] text-muted-foreground font-mono">
          {fromLabel} &rarr; {toLabel}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {sections.map((s) => {
          const mod = "modified" in s.data ? (s.data as { modified?: number }).modified ?? 0 : 0;
          if (s.data.added === 0 && s.data.removed === 0 && mod === 0) return null;
          return (
            <div key={s.label} className="rounded-md border border-gray-100 bg-gray-50/50 p-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">{s.label}</p>
              <div className="flex items-center gap-2">
                <DiffCountChip icon={<Plus className="w-2.5 h-2.5 text-emerald-600" />} count={s.data.added} label={`${s.data.added} added`} />
                <DiffCountChip icon={<Minus className="w-2.5 h-2.5 text-red-500" />} count={s.data.removed} label={`${s.data.removed} removed`} />
                {mod > 0 && (
                  <DiffCountChip icon={<Pencil className="w-2.5 h-2.5 text-amber-600" />} count={mod} label={`${mod} modified`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Promote Modal ---

function PromoteModal({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimelineEntry;
}) {
  const { toast } = useToast();
  const [preflightRequested, setPreflightRequested] = useState(false);
  const preflight = useDraftPreflight(entry.draftId, preflightRequested);
  const createIntent = useCreatePromotionIntent(entry.draftId);

  const preflightStatus = preflight.data?.status;
  const canCreate = preflightRequested && !preflight.isLoading && preflightStatus !== "error";

  const handleCreate = () => {
    createIntent.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Promotion intent created", description: "DEV \u2192 TEST intent is now in draft status." });
        onOpenChange(false);
        setPreflightRequested(false);
      },
      onError: (err) => {
        toast({ title: "Failed to create intent", description: String(err), variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPreflightRequested(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-amber-500" />
            Promote DEV &rarr; TEST
          </DialogTitle>
          <DialogDescription>
            Create a promotion intent for <span className="font-medium">{entry.title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Environment badges */}
          <div className="flex items-center justify-center gap-3 py-2">
            <EnvBadge env="DEV" />
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
            <EnvBadge env="TEST" />
          </div>

          {/* Preflight readiness */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Readiness</p>
            {!preflightRequested ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPreflightRequested(true)}
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Run Preflight
              </Button>
            ) : preflight.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md bg-gray-50">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running preflight checks...
              </div>
            ) : preflight.error ? (
              <div className="flex items-center gap-2 text-sm text-red-600 p-2 border border-red-200 rounded-md bg-red-50">
                <XCircle className="w-4 h-4" />
                Preflight failed to load
              </div>
            ) : preflightStatus === "ready" ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 p-2 border border-emerald-200 rounded-md bg-emerald-50">
                <CheckCircle2 className="w-4 h-4" />
                All checks passed ({preflight.data!.summary.warnings} warnings)
              </div>
            ) : preflightStatus === "warning" ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 p-2 border border-amber-200 rounded-md bg-amber-50">
                <AlertTriangle className="w-4 h-4" />
                {preflight.data!.summary.warnings} warning(s) — promotion allowed
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-red-600 p-2 border border-red-200 rounded-md bg-red-50">
                <XCircle className="w-4 h-4" />
                {preflight.data!.summary.errors} error(s) — resolve before promoting
              </div>
            )}
          </div>

          {/* Impact preview from existing diff */}
          {entry.diff?.available && entry.diff.summary && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Impact (latest draft diff)</p>
              <DiffSummaryGrid
                summary={entry.diff.summary}
                fromLabel={entry.diff.fromLabel}
                toLabel={entry.diff.toLabel}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canCreate || createIntent.isPending}
            onClick={handleCreate}
          >
            {createIntent.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4 mr-1.5" />
            )}
            Create Promotion Intent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Timeline Entry Card ---

function TimelineEntryCard({ entry, isLatestDraft }: { entry: TimelineEntry; isLatestDraft: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const config = TYPE_CONFIG[entry.type];
  const href = entry.type === "change" ? `/changes/${entry.id}` : entry.draftId ? `/apps/${entry.draftId}` : undefined;
  const canExpand = entry.diff?.available && entry.diff.summary;
  const canPromote = entry.type === "draft" && entry.draftId && isLatestDraft;

  const header = (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge label={config.label} tone={config.tone} size="sm" />
        {entry.status && (
          <StatusBadge label={entry.status} tone={statusTone(entry.status)} size="sm" />
        )}
        {entry.aiGenerated !== undefined && (
          <StatusBadge
            label={entry.aiGenerated ? "AI" : "Human"}
            tone={entry.aiGenerated ? "ai" : "neutral"}
            size="sm"
            icon={entry.aiGenerated ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
          />
        )}
        {entry.fromEnv && entry.toEnv && (
          <span className="inline-flex items-center gap-1">
            <EnvBadge env={entry.fromEnv} />
            <span className="text-muted-foreground text-[10px]">&rarr;</span>
            <EnvBadge env={entry.toEnv} />
          </span>
        )}
        {entry.diff?.available && entry.diff.summary && (
          <span className="inline-flex items-center gap-1 ml-auto">
            <DiffCountChip
              icon={<Plus className="w-2.5 h-2.5 text-emerald-600" />}
              count={entry.diff.summary.recordTypes.added + (entry.diff.summary.workflows?.added ?? 0)}
              label="added"
            />
            <DiffCountChip
              icon={<Minus className="w-2.5 h-2.5 text-red-500" />}
              count={entry.diff.summary.recordTypes.removed + (entry.diff.summary.workflows?.removed ?? 0)}
              label="removed"
            />
            <DiffCountChip
              icon={<Pencil className="w-2.5 h-2.5 text-amber-600" />}
              count={entry.diff.summary.recordTypes.modified}
              label="modified"
            />
          </span>
        )}
      </div>
      <p className="text-sm font-medium truncate">{entry.title}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {entry.createdBy}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
        </span>
        {entry.version !== undefined && (
          <span className="font-mono">v{entry.version}</span>
        )}
      </div>
    </div>
  );

  const inner = (
    <Card className={`border-l-4 ${config.color} ${href && !canExpand && !canPromote ? "hover:bg-muted/30 cursor-pointer" : ""} transition-colors`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-4">
          {header}
          <div className="shrink-0 mt-0.5 flex items-center gap-1">
            {canPromote && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPromoteOpen(true); }}
              >
                <Rocket className="w-3 h-3 mr-1" />
                Promote
              </Button>
            )}
            {entry.type === "change" && <GitPullRequestArrow className="w-4 h-4 text-blue-500" />}
            {entry.type === "draft" && <FileCode2 className="w-4 h-4 text-blue-500" />}
            {entry.type === "promotion-intent" && <ArrowRightLeft className="w-4 h-4 text-amber-500" />}
            {entry.type === "pull-down" && <Download className="w-4 h-4 text-violet-500" />}
            {canExpand && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
                className="ml-1 p-0.5 rounded hover:bg-muted/50 transition-colors"
                aria-label={expanded ? "Collapse diff" : "Expand diff"}
              >
                {expanded
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
            )}
          </div>
        </div>
        {expanded && entry.diff?.summary && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <DiffSummaryGrid
              summary={entry.diff.summary}
              fromLabel={entry.diff.fromLabel}
              toLabel={entry.diff.toLabel}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      {href && !canExpand && !canPromote ? (
        <Link href={href}>{inner}</Link>
      ) : (
        inner
      )}
      {canPromote && (
        <PromoteModal open={promoteOpen} onOpenChange={setPromoteOpen} entry={entry} />
      )}
    </>
  );
}

// --- Page ---

export default function Changes() {
  const { data: timeline, isLoading } = useTimeline();

  // Compute latest version per draftId: newest createdAt wins
  const latestDraftEntryIds = useMemo(() => {
    if (!timeline) return new Set<string>();
    const newestByDraft = new Map<string, { id: string; createdAt: string }>();
    for (const entry of timeline) {
      if (entry.type !== "draft" || !entry.draftId) continue;
      const current = newestByDraft.get(entry.draftId);
      if (!current || new Date(entry.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        newestByDraft.set(entry.draftId, { id: entry.id, createdAt: entry.createdAt });
      }
    }
    return new Set(Array.from(newestByDraft.values()).map((v) => v.id));
  }, [timeline]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Change Timeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unified view of changes, drafts, promotions, and pull-downs
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !timeline || timeline.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GitPullRequestArrow className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No activity yet</h3>
            <p className="text-sm text-muted-foreground">
              Changes, drafts, and promotions will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {timeline.map((entry) => (
            <TimelineEntryCard
              key={entry.id}
              entry={entry}
              isLatestDraft={latestDraftEntryIds.has(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
