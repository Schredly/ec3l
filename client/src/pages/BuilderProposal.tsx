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
import { useSharedPrimitives } from "@/hooks/useSharedPrimitives";
import { createBuilderDraft } from "@/lib/api/vibe";
import type { BuilderProposal, SharedReference } from "@/lib/api/vibe";

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

function SharedPrimitivesSelector({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (key: string, ref: SharedReference) => void;
}) {
  const { data, isLoading } = useSharedPrimitives();
  const [open, setOpen] = useState(false);

  if (isLoading) return null;
  if (!data) return null;

  const items: { ref: SharedReference; label: string; category: string }[] = [
    ...data.roles.map((r) => ({
      ref: { entityType: "role" as const, key: r.name },
      label: r.name,
      category: "Roles",
    })),
    ...data.workflows.map((w) => ({
      ref: { entityType: "workflow" as const, key: w.name },
      label: w.name,
      category: "Workflows",
    })),
    ...data.slaPolicies.map((s) => ({
      ref: { entityType: "sla" as const, key: s.recordTypeKey },
      label: `${s.recordTypeName} (${s.durationMinutes}m)`,
      category: "SLAs",
    })),
    ...data.assignmentRules.map((a) => ({
      ref: { entityType: "assignment" as const, key: a.recordTypeKey },
      label: `${a.recordTypeName} (${a.strategyType})`,
      category: "Assignments",
    })),
  ];

  if (items.length === 0) return null;

  const groupedByCategory = items.reduce(
    (acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    },
    {} as Record<string, typeof items>,
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">
          Reuse Shared Primitives
          {selected.size > 0 && (
            <span className="ml-2 text-xs text-blue-600">{selected.size} selected</span>
          )}
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Select existing tenant primitives to reference in this draft (not copied, referenced by key).
          </p>
          {Object.entries(groupedByCategory).map(([category, catItems]) => (
            <div key={category}>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {category}
              </div>
              <div className="space-y-1">
                {catItems.map((item) => {
                  const refKey = `${item.ref.entityType}:${item.ref.key}`;
                  return (
                    <label
                      key={refKey}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(refKey)}
                        onChange={() => onToggle(refKey, item.ref)}
                        className="rounded border-gray-300"
                      />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
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
  const [selectedRefs, setSelectedRefs] = useState<Map<string, SharedReference>>(new Map());

  const { data: proposal, isLoading, isError, error, isFetching } = useBuilderProposal(submittedPrompt);

  const handleToggleRef = useCallback((key: string, ref: SharedReference) => {
    setSelectedRefs((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, ref);
      }
      return next;
    });
  }, []);

  const createDraft = useMutation({
    mutationFn: () => {
      const refs = Array.from(selectedRefs.values());
      return createBuilderDraft(submittedPrompt, refs.length > 0 ? refs : undefined);
    },
    onSuccess: (result) => {
      navigate(`/builder/drafts/${result.appId}`);
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

          <SharedPrimitivesSelector
            selected={new Set(selectedRefs.keys())}
            onToggle={handleToggleRef}
          />

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
