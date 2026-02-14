import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeStatusBadge } from "@/components/status-badge";
import {
  GitPullRequestArrow,
  GitBranch,
  Clock,
  FolderGit2,
} from "lucide-react";
import type { ChangeRecord, Project } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function Changes() {
  const { data: changes, isLoading: loadingChanges } = useQuery<ChangeRecord[]>({
    queryKey: ["/api/changes"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = new Map(projects?.map((p) => [p.id, p]) || []);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">All Changes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track all change records across projects
        </p>
      </div>

      {loadingChanges ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !changes || changes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GitPullRequestArrow className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No changes yet</h3>
            <p className="text-sm text-muted-foreground">
              Create a project and start making changes
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {changes.map((change) => {
            const project = projectMap.get(change.projectId);
            return (
              <Link key={change.id} href={`/changes/${change.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-change-${change.id}`}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{change.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {project && (
                          <span className="flex items-center gap-1">
                            <FolderGit2 className="w-3 h-3" />
                            {project.name}
                          </span>
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
                    <ChangeStatusBadge status={change.status} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
