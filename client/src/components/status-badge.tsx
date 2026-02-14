import { Badge } from "@/components/ui/badge";
import { Circle, GitBranch, Play, CheckCircle2, GitMerge, Clock, XCircle, Loader2 } from "lucide-react";

const changeStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ReactNode }> = {
  Draft: { label: "Draft", variant: "secondary", icon: <Circle className="w-3 h-3" /> },
  WorkspaceRunning: { label: "Workspace Running", variant: "default", icon: <Play className="w-3 h-3" /> },
  Validating: { label: "Validating", variant: "outline", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  Ready: { label: "Ready", variant: "default", icon: <CheckCircle2 className="w-3 h-3" /> },
  Merged: { label: "Merged", variant: "secondary", icon: <GitMerge className="w-3 h-3" /> },
};

const workspaceStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ReactNode }> = {
  Pending: { label: "Pending", variant: "secondary", icon: <Clock className="w-3 h-3" /> },
  Running: { label: "Running", variant: "default", icon: <Play className="w-3 h-3" /> },
  Stopped: { label: "Stopped", variant: "outline", icon: <Circle className="w-3 h-3" /> },
  Failed: { label: "Failed", variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
};

const agentRunStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ReactNode }> = {
  Pending: { label: "Pending", variant: "secondary", icon: <Clock className="w-3 h-3" /> },
  Running: { label: "Running", variant: "default", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  Passed: { label: "Passed", variant: "default", icon: <CheckCircle2 className="w-3 h-3" /> },
  Failed: { label: "Failed", variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
};

export function ChangeStatusBadge({ status }: { status: string }) {
  const config = changeStatusConfig[status] || { label: status, variant: "secondary" as const, icon: <Circle className="w-3 h-3" /> };
  return (
    <Badge variant={config.variant} data-testid={`badge-change-status-${status}`} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function WorkspaceStatusBadge({ status }: { status: string }) {
  const config = workspaceStatusConfig[status] || { label: status, variant: "secondary" as const, icon: <Circle className="w-3 h-3" /> };
  return (
    <Badge variant={config.variant} data-testid={`badge-workspace-status-${status}`} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function AgentRunStatusBadge({ status }: { status: string }) {
  const config = agentRunStatusConfig[status] || { label: status, variant: "secondary" as const, icon: <Circle className="w-3 h-3" /> };
  return (
    <Badge variant={config.variant} data-testid={`badge-agent-status-${status}`} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}
