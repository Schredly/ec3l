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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTimeline } from "@/hooks/useTimeline";
import type { TimelineEntry, TimelineEntryType } from "@/lib/api/timeline";

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

function TimelineEntryCard({ entry }: { entry: TimelineEntry }) {
  const config = TYPE_CONFIG[entry.type];
  const href = entry.type === "change" ? `/changes/${entry.id}` : entry.draftId ? `/apps/${entry.draftId}` : undefined;

  const inner = (
    <Card className={`border-l-4 ${config.color} ${href ? "hover:bg-muted/30 cursor-pointer" : ""} transition-colors`}>
      <CardContent className="flex items-start justify-between gap-4 py-3 px-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge label={config.label} tone={config.tone} size="sm" />
            {entry.status && (
              <StatusBadge label={entry.status} tone={statusTone(entry.status)} size="sm" />
            )}
            {entry.fromEnv && entry.toEnv && (
              <span className="inline-flex items-center gap-1">
                <EnvBadge env={entry.fromEnv} />
                <span className="text-muted-foreground text-[10px]">&rarr;</span>
                <EnvBadge env={entry.toEnv} />
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
        <div className="shrink-0 mt-0.5">
          {entry.type === "change" && <GitPullRequestArrow className="w-4 h-4 text-blue-500" />}
          {entry.type === "draft" && <FileCode2 className="w-4 h-4 text-blue-500" />}
          {entry.type === "promotion-intent" && <ArrowRightLeft className="w-4 h-4 text-amber-500" />}
          {entry.type === "pull-down" && <Download className="w-4 h-4 text-violet-500" />}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
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
