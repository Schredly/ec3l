import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChangeStatusBadge, WorkspaceStatusBadge, AgentRunStatusBadge } from "@/components/status-badge";
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  GitPullRequestArrow,
  Bot,
  Terminal,
  GitBranch,
  Clock,
  FileCode2,
  Loader2,
} from "lucide-react";
import type { ChangeRecord, Workspace, AgentRun, Project } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function WorkspacePanel({ changeId, workspace }: { changeId: string; workspace?: Workspace | null }) {
  const { toast } = useToast();

  const startWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/changes/${changeId}/start-workspace`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/changes", changeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes", changeId, "workspace"] });
      toast({ title: "Workspace started" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Terminal className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground mb-3">No workspace running</p>
        <Button
          onClick={() => startWorkspaceMutation.mutate()}
          disabled={startWorkspaceMutation.isPending}
          data-testid="button-start-workspace"
        >
          {startWorkspaceMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Start Workspace
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">Workspace</p>
          <p className="text-xs text-muted-foreground font-mono">{workspace.id.slice(0, 8)}...</p>
        </div>
        <WorkspaceStatusBadge status={workspace.status} />
      </div>
      <div className="rounded-md bg-card p-4 font-mono text-sm space-y-2 border border-card-border">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-muted-foreground">Container</span>
          <span className="text-xs">{workspace.containerId || "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-muted-foreground">Preview</span>
          <span className="text-xs">{workspace.previewUrl || "Not available"}</span>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-muted-foreground">Started</span>
          <span className="text-xs">{formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
      {workspace.status === "Running" && (
        <div className="rounded-md bg-background border p-4 font-mono text-xs text-muted-foreground">
          <p className="mb-1 text-foreground text-sm">Terminal Output</p>
          <div className="space-y-1">
            <p>$ git clone --depth 1 ...</p>
            <p>Cloning into workspace...</p>
            <p>Resolving deltas: 100%, done.</p>
            <p className="text-green-500">Workspace ready.</p>
          </div>
        </div>
      )}
    </div>
  );
}

const agentFormSchema = z.object({ intent: z.string().min(1, "Intent is required") });

function AgentRunPanel({ changeId, agentRuns }: { changeId: string; agentRuns: AgentRun[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const agentForm = useForm<z.infer<typeof agentFormSchema>>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: { intent: "" },
  });

  const startAgentMutation = useMutation({
    mutationFn: async (values: z.infer<typeof agentFormSchema>) => {
      const res = await apiRequest("POST", `/api/changes/${changeId}/agent-run`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/changes", changeId, "agent-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes", changeId] });
      setOpen(false);
      agentForm.reset();
      toast({ title: "Agent run started" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium">Agent Runs</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-new-agent-run">
              <Bot className="w-4 h-4 mr-2" />
              Run Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Agent Run</DialogTitle>
            </DialogHeader>
            <Form {...agentForm}>
              <form
                onSubmit={agentForm.handleSubmit((values) => startAgentMutation.mutate(values))}
                className="space-y-4"
              >
                <FormField
                  control={agentForm.control}
                  name="intent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intent</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Fix linting errors in auth module"
                          data-testid="input-agent-intent"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={startAgentMutation.isPending}
                  data-testid="button-submit-agent-run"
                >
                  {startAgentMutation.isPending ? "Starting..." : "Start Run"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {agentRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Bot className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No agent runs</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agentRuns.map((run) => {
            let skills: string[] = [];
            try {
              skills = JSON.parse(run.skillsUsed);
            } catch {}
            let logs: string[] = [];
            try {
              logs = JSON.parse(run.logs);
            } catch {}

            return (
              <Card key={run.id} data-testid={`card-agent-run-${run.id}`}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">{run.intent}</p>
                    <AgentRunStatusBadge status={run.status} />
                  </div>
                  {skills.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground mr-1">Skills:</span>
                      {skills.map((skill, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 rounded-md bg-muted font-mono">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {logs.length > 0 && (
                    <div className="rounded-md bg-background border p-3 font-mono text-xs text-muted-foreground max-h-32 overflow-y-auto">
                      {logs.map((log, idx) => (
                        <p key={idx}>{log}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: change, isLoading: loadingChange } = useQuery<ChangeRecord>({
    queryKey: ["/api/changes", id],
  });

  const { data: workspace } = useQuery<Workspace | null>({
    queryKey: ["/api/changes", id, "workspace"],
  });

  const { data: agentRuns } = useQuery<AgentRun[]>({
    queryKey: ["/api/changes", id, "agent-runs"],
  });

  const { data: project } = useQuery<Project | null>({
    queryKey: ["/api/changes", id, "project"],
  });

  const checkinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/changes/${id}/checkin`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/changes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes"] });
      toast({ title: "Checked in", description: "Change status updated to Ready." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/changes/${id}/merge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/changes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes"] });
      toast({ title: "Merged", description: "Change has been merged." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (loadingChange) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!change) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-muted-foreground">Change not found.</p>
      </div>
    );
  }

  const statusSteps = ["Draft", "WorkspaceRunning", "Validating", "Ready", "Merged"];
  const currentIdx = statusSteps.indexOf(change.status);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href={project ? `/projects/${project.id}` : "/changes"}>
          <Button variant="ghost" size="icon" data-testid="button-back-change">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{change.title}</h1>
            <ChangeStatusBadge status={change.status} />
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            {project && (
              <Link href={`/projects/${project.id}`}>
                <span className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                  <FileCode2 className="w-3 h-3" />
                  {project.name}
                </span>
              </Link>
            )}
            {change.modulePath && (
              <span className="font-mono">{change.modulePath}</span>
            )}
            {change.branchName && (
              <span className="flex items-center gap-1 font-mono">
                <GitBranch className="w-3 h-3" />
                {change.branchName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(change.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-1">
            {statusSteps.map((step, idx) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-3 h-3 rounded-full border-2 ${
                      idx <= currentIdx
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    }`}
                  />
                  <span className={`text-[10px] mt-1 font-mono ${
                    idx <= currentIdx ? "text-foreground" : "text-muted-foreground/50"
                  }`}>
                    {step === "WorkspaceRunning" ? "Running" : step}
                  </span>
                </div>
                {idx < statusSteps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-1 rounded ${
                      idx < currentIdx ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {change.description && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{change.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {change.status === "WorkspaceRunning" && (
          <Button
            onClick={() => checkinMutation.mutate()}
            disabled={checkinMutation.isPending}
            data-testid="button-checkin"
          >
            {checkinMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Check In
          </Button>
        )}
        {change.status === "Ready" && (
          <Button
            onClick={() => mergeMutation.mutate()}
            disabled={mergeMutation.isPending}
            data-testid="button-merge"
          >
            {mergeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <GitPullRequestArrow className="w-4 h-4 mr-2" />
            )}
            Merge
          </Button>
        )}
      </div>

      <Tabs defaultValue="workspace" className="w-full">
        <TabsList>
          <TabsTrigger value="workspace" data-testid="tab-workspace">
            <Terminal className="w-4 h-4 mr-2" />
            Workspace
          </TabsTrigger>
          <TabsTrigger value="agent" data-testid="tab-agent">
            <Bot className="w-4 h-4 mr-2" />
            Agent Runs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <WorkspacePanel changeId={change.id} workspace={workspace} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="agent" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <AgentRunPanel changeId={change.id} agentRuns={agentRuns || []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
