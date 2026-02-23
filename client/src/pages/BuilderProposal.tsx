import { useState, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBuilderProposal } from "@/hooks/useBuilderProposal";
import { createBuilderDraft } from "@/lib/api/vibe";
import type { BuilderProposal } from "@/lib/api/vibe";

const SECTION_LABELS: { key: keyof Omit<BuilderProposal, "appName">; label: string }[] = [
  { key: "recordTypes", label: "Record Types" },
  { key: "roles", label: "Roles" },
  { key: "workflows", label: "Workflows" },
  { key: "approvals", label: "Approvals" },
  { key: "notifications", label: "Notifications" },
];

function CollapsibleSection({ label, items }: { label: string; items: string[] }) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">
          {label}
          <span className="ml-2 text-xs text-muted-foreground">{items.length}</span>
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-4">
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item}
                className="text-sm text-muted-foreground pl-2 border-l-2 border-gray-200 py-0.5"
              >
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function ProposalSkeleton() {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto">
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-64 mt-2" />
      </div>
      <div className="space-y-2">
        {SECTION_LABELS.map(({ key }) => (
          <Card key={key}>
            <div className="px-4 py-3">
              <Skeleton className="h-4 w-32" />
            </div>
            <CardContent className="pt-0 pb-3 px-4 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProposalError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="w-10 h-10 text-destructive" />
      <div>
        <p className="text-sm font-medium">Failed to generate proposal</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        Retry
      </Button>
    </div>
  );
}

export default function BuilderProposal() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialPrompt = params.get("prompt") || "";
  const [prompt, setPrompt] = useState(initialPrompt);
  const [submittedPrompt, setSubmittedPrompt] = useState(initialPrompt);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: proposal, isLoading, isError, error, isFetching } = useBuilderProposal(submittedPrompt);

  const createDraft = useMutation({
    mutationFn: () => createBuilderDraft(submittedPrompt),
    onSuccess: (result) => {
      navigate(`/apps/${result.appId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create draft", description: err.message, variant: "destructive" });
    },
  });

  const handleRegenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    queryClient.removeQueries({ queryKey: ["vibe-proposal", trimmed] });
    setSubmittedPrompt(trimmed);
  }, [prompt, queryClient]);

  const handleRetry = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["vibe-proposal", submittedPrompt.trim()] });
    const current = submittedPrompt;
    setSubmittedPrompt("");
    queueMicrotask(() => setSubmittedPrompt(current));
  }, [submittedPrompt, queryClient]);

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* Left panel — prompt */}
      <div className="w-[38%] shrink-0 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your Prompt</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit and regenerate to refine the proposal.
          </p>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="flex-1 min-h-[120px] resize-none text-sm"
        />
        <Button
          variant="outline"
          onClick={handleRegenerate}
          disabled={!prompt.trim() || isFetching}
          className="w-full"
        >
          {isFetching ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating...
            </>
          ) : (
            "Regenerate"
          )}
        </Button>
      </div>

      {/* Right panel — proposal / loading / error */}
      {isLoading || (isFetching && !proposal) ? (
        <ProposalSkeleton />
      ) : isError ? (
        <ProposalError
          message={error instanceof Error ? error.message : "Unknown error"}
          onRetry={handleRetry}
        />
      ) : proposal ? (
        <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{proposal.appName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-generated proposal based on your description.
            </p>
          </div>

          <div className="space-y-2">
            {SECTION_LABELS.map(({ key, label }) => (
              <CollapsibleSection
                key={key}
                label={label}
                items={proposal[key]}
              />
            ))}
          </div>

          <div className="pt-2 pb-4">
            <Button
              onClick={() => createDraft.mutate()}
              disabled={createDraft.isPending}
              className="w-full"
            >
              {createDraft.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Draft...
                </>
              ) : (
                "Create Draft App"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Enter a prompt and click Regenerate.</p>
        </div>
      )}
    </div>
  );
}
