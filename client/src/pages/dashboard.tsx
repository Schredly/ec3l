import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeStatusBadge } from "@/components/status-badge";
import {
  FolderGit2,
  GitPullRequestArrow,
  Bot,
  ArrowRight,
  Plus,
  Activity,
} from "lucide-react";
import type { Project, ChangeRecord, AgentRun } from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  testId,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  loading: boolean;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold font-mono" data-testid={`text-${testId}-value`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: changes, isLoading: loadingChanges } = useQuery<ChangeRecord[]>({
    queryKey: ["/api/changes"],
  });

  const { data: agentRuns, isLoading: loadingRuns } = useQuery<AgentRun[]>({
    queryKey: ["/api/agent-runs"],
  });

  const recentChanges = changes?.slice(0, 5) || [];
  const activeChanges = changes?.filter((c) => c.status !== "Merged" && c.status !== "Draft") || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your ChangeOps pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/projects">
            <Button variant="outline" data-testid="button-new-project">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Projects"
          value={projects?.length || 0}
          icon={FolderGit2}
          loading={loadingProjects}
          testId="stat-projects"
        />
        <StatCard
          title="Active Changes"
          value={activeChanges.length}
          icon={GitPullRequestArrow}
          loading={loadingChanges}
          testId="stat-active-changes"
        />
        <StatCard
          title="Agent Runs"
          value={agentRuns?.length || 0}
          icon={Bot}
          loading={loadingRuns}
          testId="stat-agent-runs"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base font-medium">Recent Changes</CardTitle>
            <Link href="/changes">
              <Button variant="ghost" size="sm" data-testid="link-view-all-changes">
                View All
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingChanges ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentChanges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No changes yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a project to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentChanges.map((change) => (
                  <Link key={change.id} href={`/changes/${change.id}`}>
                    <div
                      className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer"
                      data-testid={`card-change-${change.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{change.title}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {change.modulePath || "root"}
                        </p>
                      </div>
                      <ChangeStatusBadge status={change.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base font-medium">Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm" data-testid="link-view-all-projects">
                View All
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingProjects ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !projects || projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderGit2 className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No projects yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add your first GitHub project</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div
                      className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer"
                      data-testid={`card-project-${project.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {project.githubRepo}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {project.defaultBranch}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
