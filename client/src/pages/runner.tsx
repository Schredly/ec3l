import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal, Server, GitCompare, ScrollText } from "lucide-react";

const endpoints = [
  {
    method: "POST",
    path: "/workspace/start",
    description: "Clone a GitHub repo at a specific commit SHA and prepare the workspace environment.",
    icon: Server,
  },
  {
    method: "POST",
    path: "/workspace/run-command",
    description: "Execute a shell command inside the cloned workspace and return stdout/stderr.",
    icon: Terminal,
  },
  {
    method: "GET",
    path: "/workspace/diff",
    description: "Return the git diff of the workspace against the base SHA.",
    icon: GitCompare,
  },
  {
    method: "GET",
    path: "/workspace/logs",
    description: "Stream or retrieve the logs from the workspace runner service.",
    icon: ScrollText,
  },
];

function MethodBadge({ method }: { method: string }) {
  const variant = method === "GET" ? "secondary" : "default";
  return <Badge variant={variant} className="font-mono text-[10px]">{method}</Badge>;
}

export default function Runner() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Runner Service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Workspace runner endpoints for cloning, executing, and diffing
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-3">
            <Terminal className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Architecture</p>
              <p className="text-xs text-muted-foreground">
                The runner service clones repos, executes commands via child_process, and returns
                diffs against the base SHA. Currently using local filesystem-based workspaces.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {endpoints.map((ep) => (
          <Card key={ep.path} data-testid={`card-endpoint-${ep.path.replace(/\//g, "-")}`}>
            <CardContent className="flex items-start gap-4 py-4">
              <div className="p-2 rounded-md bg-muted flex-shrink-0">
                <ep.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <MethodBadge method={ep.method} />
                  <span className="text-sm font-mono">{ep.path}</span>
                </div>
                <p className="text-sm text-muted-foreground">{ep.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
