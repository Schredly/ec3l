import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Eye, ArrowUpCircle, Loader2, Sparkles, GitPullRequest } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AppManageDetail {
  id: string;
  appKey: string;
  displayName: string;
  installedVersion: string;
  status: string;
  availableVersions: string[];
  recordTypes: { key: string; name: string; id: string }[];
}

export default function AppManagePage() {
  const { appKey } = useParams<{ appKey: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [vibeOpen, setVibeOpen] = useState(false);
  const [vibePrompt, setVibePrompt] = useState("");

  const { data: app, isLoading } = useQuery<AppManageDetail>({
    queryKey: ["/api/apps", appKey, "manage"],
    queryFn: async () => {
      const res = await fetch(`/api/apps/${appKey}`, {
        headers: {
          "x-tenant-id": localStorage.getItem("tenantId") || "default",
          "x-user-id": localStorage.getItem("userId") || "user-admin",
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!appKey,
  });

  const upgradeMutation = useMutation({
    mutationFn: async (targetVersion: string) => {
      const res = await apiRequest("POST", `/api/apps/${appKey}/upgrade`, { targetVersion });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      toast({
        title: "Upgrade complete",
        description: `Upgraded from v${result.previousVersion} to v${result.newVersion}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Upgrade failed", description: err.message, variant: "destructive" });
    },
  });

  const vibeMutation = useMutation({
    mutationFn: async (prompt: string) => {
      // Find a projectId associated with this app to scope the draft
      // The vibe draft API requires a projectId
      const res = await apiRequest("POST", "/api/vibe/drafts", {
        prompt,
        appName: app?.displayName,
      });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vibe/drafts"] });
      toast({ title: "AI Draft created", description: "Redirecting to review..." });
      setVibeOpen(false);
      setVibePrompt("");
      navigate(`/builder/drafts/${result.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create draft", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <p className="text-sm text-muted-foreground">App not found.</p>
      </div>
    );
  }

  const hasUpgrade = app.availableVersions && app.availableVersions.length > 0;
  const latestVersion = hasUpgrade ? app.availableVersions[app.availableVersions.length - 1] : null;

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/apps/${appKey}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage {app.displayName}</h1>
          <p className="text-sm text-muted-foreground font-mono">{app.appKey}</p>
        </div>
      </div>

      {/* Modify Actions */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Modify App
          </h2>
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setVibeOpen(true)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Propose Change with AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("/changes")}
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              Create Change (PR)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version Info */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Version
          </h2>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-lg font-semibold">v{app.installedVersion}</p>
              <p className="text-xs text-muted-foreground">Currently installed</p>
            </div>
            <Badge variant={app.status === "installed" ? "default" : "secondary"}>
              {app.status}
            </Badge>
          </div>

          {hasUpgrade && latestVersion ? (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium">
                  Update available: v{latestVersion}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" disabled>
                  <Eye className="w-3.5 h-3.5" />
                  Preview Upgrade
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={upgradeMutation.isPending}
                  onClick={() => upgradeMutation.mutate(latestVersion)}
                >
                  {upgradeMutation.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Upgrading...</>
                  ) : (
                    <><RefreshCw className="w-3.5 h-3.5" />Apply Upgrade</>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                You're on the latest version.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Types */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Record Types
          </h2>
          {app.recordTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No record types in this app.</p>
          ) : (
            <div className="space-y-1">
              {app.recordTypes.map((rt) => (
                <div key={rt.key} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">{rt.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{rt.key}</p>
                  </div>
                  <Link href={`/apps/${appKey}/records/${rt.key}`}>
                    <Button variant="ghost" size="sm" className="text-xs">
                      View Records
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Proposal Modal */}
      <Dialog open={vibeOpen} onOpenChange={setVibeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Propose Change with AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Describe what you want to change about <strong>{app.displayName}</strong>.
              The AI will generate a scoped draft that you can review, compare, and adopt.
            </p>
            <Textarea
              value={vibePrompt}
              onChange={(e) => setVibePrompt(e.target.value)}
              placeholder={`e.g., "Add a priority field to ${app.recordTypes[0]?.name || 'records'}" or "Create a new approval workflow"`}
              className="min-h-[100px]"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setVibeOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!vibePrompt.trim() || vibeMutation.isPending}
                onClick={() => vibeMutation.mutate(vibePrompt.trim())}
                className="gap-1.5"
              >
                {vibeMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" />Generate Draft</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
