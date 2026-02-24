import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/status/StatusBadge";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTimeline } from "@/hooks/useTimeline";
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

function TimelineEntryCard({ entry }: { entry: TimelineEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[entry.type];
  const href = entry.type === "change" ? `/changes/${entry.id}` : entry.draftId ? `/apps/${entry.draftId}` : undefined;
  const canExpand = entry.diff?.available && entry.diff.summary;

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
    <Card className={`border-l-4 ${config.color} ${href && !canExpand ? "hover:bg-muted/30 cursor-pointer" : ""} transition-colors`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-4">
          {header}
          <div className="shrink-0 mt-0.5 flex items-center gap-1">
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

  if (href && !canExpand) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

export default function Changes() {
  const { data: timeline, isLoading } = useTimeline();

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
            <TimelineEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
