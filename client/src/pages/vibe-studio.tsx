import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles,
  Plus,
  Eye,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Package,
  Hash,
  Trash2,
  ArrowRight,
  GitCompare,
  Play,
  ThumbsUp,
  XCircle,
  Pencil,
  History,
  Undo2,
  Layers,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VibeDraftStatusBadge } from "@/components/status/VibeDraftStatusBadge";
import { PromotionIntentStatusBadge } from "@/components/status/PromotionIntentStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  createDraft,
  listDrafts,
  refineDraft,
  previewDraft,
  installDraft,
  discardDraft,
  patchDraft,
  listDraftVersions,
  restoreDraftVersion,
  generateMulti,
  createDraftFromVariant,
  diffVariants,
  adoptVariantIntoDraft,
  diffDraftVersions,
  streamPreview,
  streamPreviewTokens,
  type VibeDraft,
  type DraftVersion,
  type DraftPatchOp,
  type VariantResult,
  type VariantDiffResult,
  type VersionDiffResult,
  type GraphDiffResult,
  type GraphValidationError,
  type StreamStageEvent,
  type TokenStreamEvent,
  type TokenStreamResult,
} from "@/lib/api/vibe";
import {
  listEnvironments,
  listEnvironmentPackages,
  diffEnvironments,
  listPromotionIntents,
  createPromotionIntent,
  previewPromotionIntent,
  approvePromotionIntent,
  executePromotionIntent,
  rejectPromotionIntent,
  type EnvironmentInfo,
  type EnvironmentPackageState,
  type EnvironmentDiffResult,
  type PromotionIntent,
} from "@/lib/api/promotion";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DiffViewer({ diff }: { diff: GraphDiffResult }) {
  const hasChanges =
    diff.addedRecordTypes.length > 0 ||
    diff.removedRecordTypes.length > 0 ||
    diff.modifiedRecordTypes.length > 0;

  if (!hasChanges) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No changes detected.
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {diff.addedRecordTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Added Record Types
          </p>
          <div className="space-y-1">
            {diff.addedRecordTypes.map((rt) => (
              <div
                key={rt.key}
                className="flex items-center justify-between px-3 py-1.5 rounded-md bg-green-500/10 text-green-700 dark:text-green-400"
              >
                <span className="font-mono text-xs">+ {rt.key}</span>
                <span className="text-xs text-muted-foreground">
                  {rt.fieldCount} field{rt.fieldCount !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {diff.removedRecordTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Removed Record Types
          </p>
          <div className="space-y-1">
            {diff.removedRecordTypes.map((rt) => (
              <div
                key={rt.key}
                className="px-3 py-1.5 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 font-mono text-xs"
              >
                - {rt.key}
              </div>
            ))}
          </div>
        </div>
      )}

      {diff.modifiedRecordTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Modified Record Types
          </p>
          <div className="space-y-1.5">
            {diff.modifiedRecordTypes.map((rt) => (
              <div
                key={rt.key}
                className="px-3 py-2 rounded-md bg-amber-500/10"
              >
                <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
                  ~ {rt.key}
                </span>
                {rt.addedFields.length > 0 && (
                  <div className="mt-1 text-xs text-green-700 dark:text-green-400">
                    + fields: {rt.addedFields.join(", ")}
                  </div>
                )}
                {rt.removedFields.length > 0 && (
                  <div className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                    - fields: {rt.removedFields.join(", ")}
                  </div>
                )}
                {rt.baseTypeChanged && (
                  <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    base type changed
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorsPanel({ errors }: { errors: GraphValidationError[] }) {
  return (
    <div className="space-y-1.5">
      {errors.map((err, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/10 text-sm"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <div>
            <span className="font-mono text-xs text-destructive">{err.code}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{err.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <ShieldAlert className="w-10 h-10" />
      <p className="text-sm font-medium">Access Denied</p>
      <p className="text-xs">You do not have the admin.view permission.</p>
      <Link href="/">
        <span className="text-xs text-primary underline cursor-pointer">Back to Dashboard</span>
      </Link>
    </div>
  );
}

// --- Promotion Panel ---

function EnvironmentPackageTable({ packages }: { packages: EnvironmentPackageState[] }) {
  if (packages.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        No packages installed.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Package</th>
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Version</th>
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Source</th>
            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground text-xs">Checksum</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.packageKey} className="border-b last:border-b-0">
              <td className="px-3 py-1.5 font-mono text-xs">{pkg.packageKey}</td>
              <td className="px-3 py-1.5 text-xs">{pkg.version}</td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{pkg.source}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{pkg.checksum.substring(0, 12)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriftViewer({ diff }: { diff: EnvironmentDiffResult }) {
  const actionable = diff.deltas.filter((d) => d.status !== "same");
  const inSync = diff.deltas.filter((d) => d.status === "same");

  if (diff.deltas.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        No packages to compare.
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {actionable.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Packages to Promote ({actionable.length})
          </p>
          <div className="space-y-1">
            {actionable.map((d) => (
              <div
                key={d.packageKey}
                className={`flex items-center justify-between px-3 py-1.5 rounded-md ${
                  d.status === "missing"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}
              >
                <span className="font-mono text-xs">{d.packageKey}</span>
                <span className="text-xs">
                  {d.status === "missing" ? "new" : `${d.fromVersion} -> ${d.toVersion}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inSync.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            In Sync ({inSync.length})
          </p>
          <div className="space-y-1">
            {inSync.map((d) => (
              <div
                key={d.packageKey}
                className="flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/50"
              >
                <span className="font-mono text-xs text-muted-foreground">{d.packageKey}</span>
                <span className="text-xs text-muted-foreground">{d.toVersion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {actionable.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>All packages are in sync.</span>
        </div>
      )}
    </div>
  );
}

function PromotionPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [fromEnvId, setFromEnvId] = useState<string>("");
  const [toEnvId, setToEnvId] = useState<string>("");
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);

  // Environments
  const { data: environments } = useQuery<EnvironmentInfo[]>({
    queryKey: ["environments", projectId],
    queryFn: () => listEnvironments(projectId),
    enabled: !!projectId,
  });

  // From-env packages
  const { data: fromPackages } = useQuery<EnvironmentPackageState[]>({
    queryKey: ["env-packages", fromEnvId],
    queryFn: () => listEnvironmentPackages(fromEnvId),
    enabled: !!fromEnvId,
  });

  // To-env packages
  const { data: toPackages } = useQuery<EnvironmentPackageState[]>({
    queryKey: ["env-packages", toEnvId],
    queryFn: () => listEnvironmentPackages(toEnvId),
    enabled: !!toEnvId,
  });

  // Drift
  const driftQuery = useQuery<EnvironmentDiffResult>({
    queryKey: ["env-drift", fromEnvId, toEnvId],
    queryFn: () => diffEnvironments(fromEnvId, toEnvId),
    enabled: false, // manual trigger only
  });

  // Promotion intents
  const { data: intents } = useQuery<PromotionIntent[]>({
    queryKey: ["promotion-intents", projectId],
    queryFn: () => listPromotionIntents(projectId),
    enabled: !!projectId,
  });

  const selectedIntent = intents?.find((i) => i.id === selectedIntentId) ?? null;

  // Mutations
  const createIntentMutation = useMutation({
    mutationFn: () =>
      createPromotionIntent({ projectId, fromEnvironmentId: fromEnvId, toEnvironmentId: toEnvId }),
    onSuccess: (intent) => {
      queryClient.invalidateQueries({ queryKey: ["promotion-intents", projectId] });
      setSelectedIntentId(intent.id);
      toast({ title: "Promotion intent created", description: `Status: ${intent.status}` });
    },
    onError: (err: Error) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const previewIntentMutation = useMutation({
    mutationFn: (id: string) => previewPromotionIntent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion-intents", projectId] });
      toast({ title: "Preview computed" });
    },
    onError: (err: Error) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const approveIntentMutation = useMutation({
    mutationFn: (id: string) => approvePromotionIntent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion-intents", projectId] });
      toast({ title: "Intent approved" });
    },
    onError: (err: Error) => {
      toast({ title: "Approve failed", description: err.message, variant: "destructive" });
    },
  });

  const executeIntentMutation = useMutation({
    mutationFn: (id: string) => executePromotionIntent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion-intents", projectId] });
      // Also refresh environment packages after execution
      queryClient.invalidateQueries({ queryKey: ["env-packages"] });
      toast({ title: "Promotion executed" });
    },
    onError: (err: Error) => {
      toast({ title: "Execute failed", description: err.message, variant: "destructive" });
    },
  });

  const rejectIntentMutation = useMutation({
    mutationFn: (id: string) => rejectPromotionIntent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion-intents", projectId] });
      toast({ title: "Intent rejected" });
    },
    onError: (err: Error) => {
      toast({ title: "Reject failed", description: err.message, variant: "destructive" });
    },
  });

  const anyMutating =
    createIntentMutation.isPending ||
    previewIntentMutation.isPending ||
    approveIntentMutation.isPending ||
    executeIntentMutation.isPending ||
    rejectIntentMutation.isPending;

  const envNameById = (id: string) => environments?.find((e) => e.id === id)?.name ?? id;

  const isIntentTerminal = selectedIntent?.status === "executed" || selectedIntent?.status === "rejected";

  return (
    <div className="space-y-6" data-testid="promotion-panel">
      {/* Environment selectors */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Environment Selection
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">From (Source)</label>
            <Select value={fromEnvId} onValueChange={setFromEnvId}>
              <SelectTrigger className="h-9" data-testid="promo-from-env">
                <SelectValue placeholder="Select source env" />
              </SelectTrigger>
              <SelectContent>
                {environments?.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name} ({env.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground mt-5 shrink-0" />
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">To (Target)</label>
            <Select value={toEnvId} onValueChange={setToEnvId}>
              <SelectTrigger className="h-9" data-testid="promo-to-env">
                <SelectValue placeholder="Select target env" />
              </SelectTrigger>
              <SelectContent>
                {environments?.filter((e) => e.id !== fromEnvId).map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name} ({env.slug})
                    {env.requiresPromotionApproval && " *"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {toEnvId && environments?.find((e) => e.id === toEnvId)?.requiresPromotionApproval && (
          <p className="text-xs text-amber-600 mt-1.5">
            * Target requires promotion approval (intent workflow required).
          </p>
        )}
      </div>

      <Separator />

      {/* Package State */}
      {(fromEnvId || toEnvId) && (
        <div className="grid grid-cols-2 gap-4">
          {fromEnvId && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {envNameById(fromEnvId)} Packages
              </h3>
              {fromPackages ? (
                <EnvironmentPackageTable packages={fromPackages} />
              ) : (
                <Skeleton className="h-20 w-full" />
              )}
            </div>
          )}
          {toEnvId && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {envNameById(toEnvId)} Packages
              </h3>
              {toPackages ? (
                <EnvironmentPackageTable packages={toPackages} />
              ) : (
                <Skeleton className="h-20 w-full" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Drift */}
      {fromEnvId && toEnvId && (
        <>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Drift Analysis
              </h2>
              <Button
                size="sm"
                variant="outline"
                disabled={driftQuery.isFetching}
                onClick={() => driftQuery.refetch()}
                data-testid="promo-compute-drift"
              >
                <GitCompare className={`w-3.5 h-3.5 mr-1.5 ${driftQuery.isFetching ? "animate-spin" : ""}`} />
                {driftQuery.isFetching ? "Computing..." : "Compute Drift"}
              </Button>
            </div>
            {driftQuery.data && <DriftViewer diff={driftQuery.data} />}
          </div>
        </>
      )}

      <Separator />

      {/* Create Promotion Intent */}
      {fromEnvId && toEnvId && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Promotion Intent
          </h2>
          <Button
            size="sm"
            disabled={!fromEnvId || !toEnvId || anyMutating}
            onClick={() => createIntentMutation.mutate()}
            data-testid="promo-create-intent"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {createIntentMutation.isPending ? "Creating..." : "Create Promotion Intent"}
          </Button>
        </div>
      )}

      <Separator />

      {/* Intent List */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Promotion History
        </h2>
        {!intents ? (
          <Skeleton className="h-16 w-full" />
        ) : intents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No promotion intents yet.</p>
        ) : (
          <div className="space-y-1">
            {intents.map((intent) => (
              <button
                key={intent.id}
                onClick={() => setSelectedIntentId(intent.id)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm ${
                  intent.id === selectedIntentId ? "bg-sidebar-accent" : "hover:bg-muted/50"
                }`}
                data-testid={`promo-intent-${intent.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">
                    {envNameById(intent.fromEnvironmentId)} <ArrowRight className="w-3 h-3 inline" /> {envNameById(intent.toEnvironmentId)}
                  </span>
                  <PromotionIntentStatusBadge status={intent.status} />
                </div>
                <span className="text-[10px] text-muted-foreground">{timeAgo(intent.createdAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Intent Detail */}
      {selectedIntent && (
        <>
          <Separator />
          <div data-testid="promo-intent-detail">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Intent Detail
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">ID:</span>
                <span className="font-mono">{selectedIntent.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <PromotionIntentStatusBadge status={selectedIntent.status} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Route:</span>
                <span>
                  {envNameById(selectedIntent.fromEnvironmentId)} <ArrowRight className="w-3 h-3 inline" /> {envNameById(selectedIntent.toEnvironmentId)}
                </span>
              </div>
              {selectedIntent.createdBy && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Created by:</span>
                  <span>{selectedIntent.createdBy}</span>
                </div>
              )}
              {selectedIntent.approvedBy && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Approved by:</span>
                  <span>{selectedIntent.approvedBy}</span>
                </div>
              )}
            </div>

            {/* Intent diff (from preview) */}
            {selectedIntent.diff != null && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Preview Diff
                </p>
                <DriftViewer diff={selectedIntent.diff as EnvironmentDiffResult} />
              </div>
            )}

            {/* Intent actions */}
            {!isIntentTerminal && (
              <div className="flex items-center gap-2 mt-4">
                {(selectedIntent.status === "draft" || selectedIntent.status === "previewed") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={anyMutating}
                    onClick={() => previewIntentMutation.mutate(selectedIntent.id)}
                    data-testid="promo-preview-intent"
                  >
                    <Eye className={`w-3.5 h-3.5 mr-1.5 ${previewIntentMutation.isPending ? "animate-spin" : ""}`} />
                    {previewIntentMutation.isPending ? "Previewing..." : "Preview"}
                  </Button>
                )}
                {selectedIntent.status === "previewed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={anyMutating}
                    onClick={() => approveIntentMutation.mutate(selectedIntent.id)}
                    data-testid="promo-approve-intent"
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 mr-1.5 ${approveIntentMutation.isPending ? "animate-spin" : ""}`} />
                    {approveIntentMutation.isPending ? "Approving..." : "Approve"}
                  </Button>
                )}
                {selectedIntent.status === "approved" && (
                  <Button
                    size="sm"
                    disabled={anyMutating}
                    onClick={() => executeIntentMutation.mutate(selectedIntent.id)}
                    data-testid="promo-execute-intent"
                  >
                    <Play className={`w-3.5 h-3.5 mr-1.5 ${executeIntentMutation.isPending ? "animate-spin" : ""}`} />
                    {executeIntentMutation.isPending ? "Executing..." : "Execute"}
                  </Button>
                )}
                {(selectedIntent.status === "draft" ||
                  selectedIntent.status === "previewed" ||
                  selectedIntent.status === "approved") && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={anyMutating}
                    onClick={() => rejectIntentMutation.mutate(selectedIntent.id)}
                    data-testid="promo-reject-intent"
                  >
                    <XCircle className={`w-3.5 h-3.5 mr-1.5 ${rejectIntentMutation.isPending ? "animate-spin" : ""}`} />
                    {rejectIntentMutation.isPending ? "Rejecting..." : "Reject"}
                  </Button>
                )}
              </div>
            )}

            {isIntentTerminal && (
              <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  This intent is <strong>{selectedIntent.status}</strong> (terminal).
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main Component ---

export default function VibeStudio() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [appName, setAppName] = useState("");
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [streamStage, setStreamStage] = useState<StreamStageEvent["stage"] | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("drafts");

  // Inline edit state
  const [editOp, setEditOp] = useState<string>("add_field");
  const [editRecordType, setEditRecordType] = useState<string>("");
  const [editFieldName, setEditFieldName] = useState("");
  const [editFieldType, setEditFieldType] = useState("string");
  const [editNewName, setEditNewName] = useState("");
  const [editSlaDuration, setEditSlaDuration] = useState<number>(60);
  const [editSlaUnit, setEditSlaUnit] = useState("minutes");
  const [editGroupKey, setEditGroupKey] = useState("");

  // Variant comparison state
  const [variants, setVariants] = useState<VariantResult[] | null>(null);
  const [variantPrompt, setVariantPrompt] = useState("");
  const [compareIdxA, setCompareIdxA] = useState<number | null>(null);
  const [compareIdxB, setCompareIdxB] = useState<number | null>(null);
  const [variantDiffResult, setVariantDiffResult] = useState<VariantDiffResult | null>(null);

  // Version diff state
  const [versionDiffFrom, setVersionDiffFrom] = useState<number | null>(null);
  const [versionDiffTo, setVersionDiffTo] = useState<number | null>(null);
  const [versionDiffResult, setVersionDiffResult] = useState<VersionDiffResult | null>(null);

  // Token streaming state
  const [tokenStreamEnabled, setTokenStreamEnabled] = useState(false);
  const [tokenBuffer, setTokenBuffer] = useState("");
  const [tokenStreamStage, setTokenStreamStage] = useState<string | null>(null);
  const [isTokenStreaming, setIsTokenStreaming] = useState(false);
  const [tokenStreamResult, setTokenStreamResult] = useState<TokenStreamResult | null>(null);

  const projectId = localStorage.getItem("projectId") || "";

  // RBAC check
  const { data: access, isLoading: accessLoading } = useQuery<{ allowed: boolean }>({
    queryKey: ["/api/admin/check-access"],
    queryFn: async () => {
      const res = await fetch("/api/admin/check-access", {
        headers: {
          "x-tenant-id": localStorage.getItem("tenantId") || "default",
          "x-user-id": localStorage.getItem("userId") || "user-admin",
        },
      });
      if (res.status === 403) return { allowed: false };
      if (!res.ok) throw new Error("Failed to check access");
      return res.json();
    },
  });

  // Drafts list
  const { data: drafts, isLoading: draftsLoading } = useQuery<VibeDraft[]>({
    queryKey: ["vibe-drafts"],
    queryFn: () => listDrafts(),
    enabled: access?.allowed === true,
  });

  const selectedDraft = drafts?.find((d) => d.id === selectedDraftId) ?? null;

  // Version history
  const { data: versions } = useQuery<DraftVersion[]>({
    queryKey: ["vibe-draft-versions", selectedDraftId],
    queryFn: () => listDraftVersions(selectedDraftId!),
    enabled: !!selectedDraftId && access?.allowed === true,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No project selected. Set a project first.");
      return createDraft({ projectId, prompt, appName: appName || undefined });
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      setSelectedDraftId(draft.id);
      setPrompt("");
      setAppName("");
      toast({ title: "Draft created", description: `Package: ${draft.package.packageKey}` });
      // Trigger streaming preview automatically for new drafts
      startStreamingPreview(draft.package.packageKey);
    },
    onError: (err: Error) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const startStreamingPreview = async (label?: string) => {
    if (!projectId || !prompt.trim()) return;

    if (tokenStreamEnabled) {
      return startTokenStreamingPreview(label);
    }

    setIsStreaming(true);
    setStreamStage("generation");
    try {
      const result = await streamPreview(
        { projectId, prompt: label || prompt, appName: appName || undefined },
        (event) => setStreamStage(event.stage),
      );
      if (result) {
        queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      }
    } catch {
      // Error handled via stage events
    } finally {
      setIsStreaming(false);
      setStreamStage(null);
    }
  };

  const startTokenStreamingPreview = async (label?: string) => {
    if (!projectId || !prompt.trim()) return;
    setIsTokenStreaming(true);
    setTokenBuffer("");
    setTokenStreamStage("generation");
    setTokenStreamResult(null);
    try {
      const result = await streamPreviewTokens(
        { projectId, prompt: label || prompt, appName: appName || undefined },
        (event: TokenStreamEvent) => {
          if (event.type === "token") {
            setTokenBuffer((prev) => prev + event.data);
          } else if (event.type === "stage") {
            setTokenStreamStage(event.stage);
          } else if (event.type === "complete") {
            setTokenStreamResult(event.result);
            setTokenStreamStage("complete");
            queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
          } else if (event.type === "error") {
            setTokenStreamStage("error");
          }
        },
      );
      if (result) {
        setTokenStreamResult(result);
      }
    } catch {
      // Error handled via events
    } finally {
      setIsTokenStreaming(false);
    }
  };

  const refineMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return refineDraft(selectedDraftId, refinementPrompt);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      setRefinementPrompt("");
      toast({ title: "Draft refined" });
      // Auto-preview after successful refine
      if (selectedDraftId) {
        previewMutation.mutate();
      }
    },
    onError: (err: Error) => {
      toast({ title: "Refine failed", description: err.message, variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return previewDraft(selectedDraftId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      toast({ title: "Preview computed" });
    },
    onError: (err: Error) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return installDraft(selectedDraftId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      toast({ title: "Installed", description: "Package installed to dev environment." });
    },
    onError: (err: Error) => {
      toast({ title: "Install failed", description: err.message, variant: "destructive" });
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return discardDraft(selectedDraftId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      setSelectedDraftId(null);
      toast({ title: "Draft discarded" });
    },
    onError: (err: Error) => {
      toast({ title: "Discard failed", description: err.message, variant: "destructive" });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (ops: DraftPatchOp[]) => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return patchDraft(selectedDraftId, ops);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      toast({ title: "Edit applied" });
      // Reset form
      setEditFieldName("");
      setEditNewName("");
      setEditGroupKey("");
      // Auto-preview
      previewMutation.mutate();
    },
    onError: (err: Error) => {
      toast({ title: "Patch failed", description: err.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionNumber: number) => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return restoreDraftVersion(selectedDraftId, versionNumber);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["vibe-draft-versions", selectedDraftId] });
      toast({ title: "Version restored" });
      previewMutation.mutate();
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const generateMultiMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No project selected");
      if (!prompt.trim()) throw new Error("Prompt is required");
      return generateMulti({ projectId, prompt, count: 3, appName: appName || undefined });
    },
    onSuccess: (data) => {
      setVariants(data.variants);
      setVariantPrompt(prompt);
      toast({ title: "Variants generated", description: `${data.variants.length} variant(s) ready for comparison` });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const selectVariantMutation = useMutation({
    mutationFn: async (pkg: VariantResult["package"]) => {
      if (!projectId) throw new Error("No project selected");
      return createDraftFromVariant({ projectId, prompt: variantPrompt, package: pkg });
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      setSelectedDraftId(draft.id);
      setVariants(null);
      setPrompt("");
      setAppName("");
      toast({ title: "Draft created from variant", description: `Package: ${draft.package.packageKey}` });
      previewMutation.mutate();
    },
    onError: (err: Error) => {
      toast({ title: "Select failed", description: err.message, variant: "destructive" });
    },
  });

  const compareVariantsMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || compareIdxA === null || compareIdxB === null || !variants) {
        throw new Error("Select two variants to compare");
      }
      return diffVariants({
        projectId,
        packageA: variants[compareIdxA]!.package,
        packageB: variants[compareIdxB]!.package,
      });
    },
    onSuccess: (data) => {
      setVariantDiffResult(data);
      toast({ title: "Variant diff computed" });
    },
    onError: (err: Error) => {
      toast({ title: "Diff failed", description: err.message, variant: "destructive" });
    },
  });

  const adoptVariantMutation = useMutation({
    mutationFn: async (pkg: VariantResult["package"]) => {
      if (!selectedDraftId) throw new Error("No draft selected");
      return adoptVariantIntoDraft(selectedDraftId, { package: pkg, prompt: variantPrompt || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vibe-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["vibe-draft-versions", selectedDraftId] });
      setVariants(null);
      setVariantDiffResult(null);
      setCompareIdxA(null);
      setCompareIdxB(null);
      toast({ title: "Variant adopted into draft" });
      previewMutation.mutate();
    },
    onError: (err: Error) => {
      toast({ title: "Adopt failed", description: err.message, variant: "destructive" });
    },
  });

  const versionDiffMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraftId || versionDiffFrom === null || versionDiffTo === null) {
        throw new Error("Select two versions to compare");
      }
      return diffDraftVersions(selectedDraftId, versionDiffFrom, versionDiffTo);
    },
    onSuccess: (data) => {
      setVersionDiffResult(data);
      toast({ title: "Version diff computed" });
    },
    onError: (err: Error) => {
      toast({ title: "Version diff failed", description: err.message, variant: "destructive" });
    },
  });

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Checking access...</p>
      </div>
    );
  }

  if (!access?.allowed) return <AccessDenied />;

  const isTerminal = selectedDraft?.status === "installed" || selectedDraft?.status === "discarded";
  const anyPending =
    createMutation.isPending ||
    refineMutation.isPending ||
    previewMutation.isPending ||
    installMutation.isPending ||
    discardMutation.isPending ||
    patchMutation.isPending ||
    restoreMutation.isPending ||
    generateMultiMutation.isPending ||
    selectVariantMutation.isPending ||
    compareVariantsMutation.isPending ||
    adoptVariantMutation.isPending ||
    versionDiffMutation.isPending ||
    isStreaming ||
    isTokenStreaming;

  return (
    <div className="flex h-full" data-testid="vibe-studio">
      {/* Left Panel */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Vibe Studio</span>
          </div>
        </div>

        {/* Create Section */}
        <div className="px-4 py-3 border-b space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your app... e.g. 'PTO request tracker'"
            className="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="vibe-prompt-input"
          />
          <input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="App name (optional)"
            className="w-full h-8 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="vibe-appname-input"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={!prompt.trim() || anyPending}
              onClick={() => createMutation.mutate()}
              data-testid="vibe-create-btn"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {createMutation.isPending ? "Creating..." : "Create Draft"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!prompt.trim() || anyPending}
              onClick={() => generateMultiMutation.mutate()}
              data-testid="vibe-compare-btn"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              {generateMultiMutation.isPending ? "Generating..." : "Compare"}
            </Button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="token-stream-toggle">
            <input
              type="checkbox"
              checked={tokenStreamEnabled}
              onChange={(e) => setTokenStreamEnabled(e.target.checked)}
              className="rounded border-muted-foreground/50"
            />
            <Terminal className="w-3 h-3" />
            Stream tokens
          </label>
        </div>

        {/* Draft List */}
        <div className="flex-1 overflow-auto">
          {draftsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !drafts || drafts.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No drafts yet. Create one above.</p>
            </div>
          ) : (
            <div className="py-1">
              {drafts.map((draft) => {
                const isSelected = draft.id === selectedDraftId;
                return (
                  <button
                    key={draft.id}
                    onClick={() => {
                      setSelectedDraftId(draft.id);
                      setActiveTab("drafts");
                    }}
                    className={`w-full text-left px-4 py-2.5 transition-colors ${
                      isSelected ? "bg-sidebar-accent" : "hover:bg-muted/50"
                    }`}
                    data-testid={`vibe-draft-${draft.id}`}
                    data-active={isSelected}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {draft.package.packageKey}
                      </span>
                      <VibeDraftStatusBadge status={draft.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        v{draft.package.version}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(draft.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b px-6 pt-2">
            <TabsList>
              <TabsTrigger value="drafts" data-testid="tab-drafts">Drafts</TabsTrigger>
              <TabsTrigger value="promotion" data-testid="tab-promotion">Promotion</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="drafts" className="flex-1 m-0">
            {variants && variants.length > 0 ? (
              <div className="p-6 max-w-5xl" data-testid="variant-compare-panel">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold">Compare Variants</h2>
                    <Badge variant="secondary" className="text-[10px]">
                      {variants.length} variant{variants.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setVariants(null);
                      setVariantDiffResult(null);
                      setCompareIdxA(null);
                      setCompareIdxB(null);
                    }}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Dismiss
                  </Button>
                </div>

                {/* Variant-to-Variant Diff Controls */}
                {variants.length >= 2 && (
                  <div className="mb-4 p-3 rounded-lg border bg-muted/30 space-y-2" data-testid="variant-diff-controls">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Compare Two Variants
                    </p>
                    <div className="flex items-center gap-2">
                      <Select
                        value={compareIdxA !== null ? String(compareIdxA) : ""}
                        onValueChange={(v) => { setCompareIdxA(Number(v)); setVariantDiffResult(null); }}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs" data-testid="compare-a-select">
                          <SelectValue placeholder="Variant A" />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.map((_, i) => (
                            <SelectItem key={i} value={String(i)} disabled={i === compareIdxB}>
                              Variant {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <Select
                        value={compareIdxB !== null ? String(compareIdxB) : ""}
                        onValueChange={(v) => { setCompareIdxB(Number(v)); setVariantDiffResult(null); }}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs" data-testid="compare-b-select">
                          <SelectValue placeholder="Variant B" />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.map((_, i) => (
                            <SelectItem key={i} value={String(i)} disabled={i === compareIdxA}>
                              Variant {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={compareIdxA === null || compareIdxB === null || anyPending}
                        onClick={() => compareVariantsMutation.mutate()}
                        data-testid="compare-variants-btn"
                      >
                        <GitCompare className={`w-3 h-3 mr-1 ${compareVariantsMutation.isPending ? "animate-spin" : ""}`} />
                        {compareVariantsMutation.isPending ? "Diffing..." : "Diff"}
                      </Button>
                    </div>
                    {variantDiffResult && (
                      <div className="mt-2" data-testid="variant-diff-result">
                        <DiffViewer diff={variantDiffResult.diff} />
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {variants.map((v, idx) => {
                    const totalFields = v.package.recordTypes.reduce(
                      (sum, rt) => sum + rt.fields.length, 0,
                    );
                    const addedCount = v.diff.addedRecordTypes.length;
                    const modifiedCount = v.diff.modifiedRecordTypes.length;
                    const isCompareSelected = idx === compareIdxA || idx === compareIdxB;
                    return (
                      <div
                        key={v.checksum}
                        className={`rounded-lg border p-4 space-y-3 transition-colors ${
                          isCompareSelected ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/50"
                        }`}
                        data-testid={`variant-${idx}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Variant {idx + 1}</span>
                          <Badge variant={v.validationErrors.length === 0 ? "default" : "destructive"} className="text-[10px]">
                            {v.validationErrors.length === 0 ? "Valid" : `${v.validationErrors.length} error${v.validationErrors.length !== 1 ? "s" : ""}`}
                          </Badge>
                        </div>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex justify-between">
                            <span>Record types</span>
                            <span className="font-mono">{v.package.recordTypes.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total fields</span>
                            <span className="font-mono">{totalFields}</span>
                          </div>
                          {(v.package.workflows?.length ?? 0) > 0 && (
                            <div className="flex justify-between">
                              <span>Workflows</span>
                              <span className="font-mono">{v.package.workflows!.length}</span>
                            </div>
                          )}
                          {(v.package.slaPolicies?.length ?? 0) > 0 && (
                            <div className="flex justify-between">
                              <span>SLA policies</span>
                              <span className="font-mono">{v.package.slaPolicies!.length}</span>
                            </div>
                          )}
                          <Separator className="my-1.5" />
                          <div className="flex justify-between">
                            <span>Diff: added</span>
                            <span className="font-mono text-green-600">{addedCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Diff: modified</span>
                            <span className="font-mono text-yellow-600">{modifiedCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Checksum</span>
                            <span className="font-mono">{v.checksum.slice(0, 8)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={anyPending}
                            onClick={() => selectVariantMutation.mutate(v.package)}
                            data-testid={`select-variant-${idx}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            {selectVariantMutation.isPending ? "Creating..." : "Select"}
                          </Button>
                          {selectedDraft && !isTerminal && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              disabled={anyPending}
                              onClick={() => adoptVariantMutation.mutate(v.package)}
                              data-testid={`adopt-variant-${idx}`}
                            >
                              <Download className="w-3.5 h-3.5 mr-1.5" />
                              {adoptVariantMutation.isPending ? "Adopting..." : "Adopt"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : !selectedDraft ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Sparkles className="w-10 h-10 opacity-20" />
                <p className="text-sm">Select a draft or create a new one</p>
              </div>
            ) : (
              <div className="p-6 space-y-6 max-w-3xl">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-lg font-semibold">{selectedDraft.package.packageKey}</h1>
                    <VibeDraftStatusBadge status={selectedDraft.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {selectedDraft.prompt}
                  </p>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    <span className="font-mono">{selectedDraft.package.packageKey}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono">v{selectedDraft.package.version}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" />
                    <span className="font-mono">{selectedDraft.checksum.substring(0, 12)}</span>
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                {!isTerminal && (
                  <div className="space-y-3">
                    {/* Refine */}
                    <div className="flex items-center gap-2">
                      <input
                        value={refinementPrompt}
                        onChange={(e) => setRefinementPrompt(e.target.value)}
                        placeholder="Refine: e.g. 'add field priority to tickets'"
                        className="flex-1 h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid="vibe-refine-input"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && refinementPrompt.trim()) {
                            refineMutation.mutate();
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!refinementPrompt.trim() || anyPending}
                        onClick={() => refineMutation.mutate()}
                        data-testid="vibe-refine-btn"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refineMutation.isPending ? "animate-spin" : ""}`} />
                        Refine
                      </Button>
                    </div>

                    {/* Preview + Install */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={anyPending}
                        onClick={() => previewMutation.mutate()}
                        data-testid="vibe-preview-btn"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        {previewMutation.isPending ? "Previewing..." : "Preview"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={selectedDraft.status !== "previewed" || anyPending}
                        onClick={() => installMutation.mutate()}
                        data-testid="vibe-install-btn"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        {installMutation.isPending ? "Installing..." : "Install to Dev"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={anyPending}
                        onClick={() => discardMutation.mutate()}
                        data-testid="vibe-discard-btn"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        {discardMutation.isPending ? "Discarding..." : "Discard"}
                      </Button>
                    </div>
                  </div>
                )}

                {isTerminal && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      This draft is <strong>{selectedDraft.status}</strong> and can no longer be modified.
                    </span>
                  </div>
                )}

                {/* Streaming status indicator */}
                {isStreaming && streamStage && (
                  <div className="flex items-center gap-2 text-sm" data-testid="vibe-stream-status">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span className="text-muted-foreground">
                      {{
                        generation: "Generating package...",
                        validation: "Validating schema...",
                        repair: "Repairing output...",
                        projection: "Projecting onto graph...",
                        diff: "Computing diff...",
                        complete: "Complete",
                        error: "Error occurred",
                      }[streamStage]}
                    </span>
                  </div>
                )}

                {/* Token Stream Output Panel */}
                {(isTokenStreaming || tokenStreamResult) && (
                  <div className="space-y-2" data-testid="token-stream-panel">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <Terminal className="w-3.5 h-3.5 inline mr-1.5" />
                        Generation Output
                      </h2>
                      {tokenStreamStage && tokenStreamStage !== "complete" && (
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {{
                              generation: "Streaming tokens...",
                              extract_json: "Extracting JSON...",
                              validate_schema: "Validating schema...",
                              repair: "Repairing...",
                              projection: "Projecting...",
                              diff: "Computing diff...",
                              error: "Error",
                            }[tokenStreamStage] ?? tokenStreamStage}
                          </span>
                        </div>
                      )}
                      {tokenStreamStage === "complete" && (
                        <Badge variant={tokenStreamResult?.success ? "default" : "destructive"} className="text-[10px]">
                          {tokenStreamResult?.success ? "Valid" : "Failed"}
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 max-h-64 overflow-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80">
                        {tokenBuffer || "(waiting for tokens...)"}
                        {isTokenStreaming && <span className="animate-pulse">|</span>}
                      </pre>
                    </div>
                    {tokenStreamResult?.diff && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Stream Diff</p>
                        <DiffViewer diff={tokenStreamResult.diff} />
                      </div>
                    )}
                    {tokenStreamResult?.schemaErrors && (
                      <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                        {tokenStreamResult.schemaErrors}
                      </div>
                    )}
                    {!isTokenStreaming && tokenStreamResult && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => {
                          setTokenBuffer("");
                          setTokenStreamStage(null);
                          setTokenStreamResult(null);
                        }}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Dismiss
                      </Button>
                    )}
                  </div>
                )}

                <Separator />

                {/* Diff Viewer */}
                {selectedDraft.lastPreviewDiff && (
                  <div>
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Preview Diff
                    </h2>
                    <DiffViewer diff={selectedDraft.lastPreviewDiff} />
                  </div>
                )}

                {/* Errors */}
                {selectedDraft.lastPreviewErrors && selectedDraft.lastPreviewErrors.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Validation Errors
                    </h2>
                    <ErrorsPanel errors={selectedDraft.lastPreviewErrors} />
                  </div>
                )}

                {/* Package Summary */}
                <div>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Package Contents
                  </h2>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Record Type</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fields</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Base Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDraft.package.recordTypes.map((rt) => (
                          <tr key={rt.key} className="border-b last:border-b-0">
                            <td className="px-4 py-2 font-mono text-xs">{rt.key}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {rt.fields.map((f) => f.name).join(", ")}
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {rt.baseType || "\u2014"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(selectedDraft.package.slaPolicies?.length ?? 0) > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {selectedDraft.package.slaPolicies!.length} SLA{" "}
                      {selectedDraft.package.slaPolicies!.length === 1 ? "policy" : "policies"}
                    </div>
                  )}
                  {(selectedDraft.package.workflows?.length ?? 0) > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedDraft.package.workflows!.length} workflow
                      {selectedDraft.package.workflows!.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>

                {/* Version History */}
                {versions && versions.length > 0 && (
                  <>
                    <Separator />
                    <div data-testid="vibe-version-history">
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        <History className="w-3.5 h-3.5 inline mr-1.5" />
                        Version History
                      </h2>

                      {/* Version-to-Version Diff Controls */}
                      {versions.length >= 2 && (
                        <div className="mb-3 p-3 rounded-lg border bg-muted/30 space-y-2" data-testid="version-diff-controls">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Compare Versions
                          </p>
                          <div className="flex items-center gap-2">
                            <Select
                              value={versionDiffFrom !== null ? String(versionDiffFrom) : ""}
                              onValueChange={(v) => { setVersionDiffFrom(Number(v)); setVersionDiffResult(null); }}
                            >
                              <SelectTrigger className="h-8 w-28 text-xs" data-testid="version-diff-from">
                                <SelectValue placeholder="From" />
                              </SelectTrigger>
                              <SelectContent>
                                {versions.map((v) => (
                                  <SelectItem key={v.versionNumber} value={String(v.versionNumber)} disabled={v.versionNumber === versionDiffTo}>
                                    v{v.versionNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">to</span>
                            <Select
                              value={versionDiffTo !== null ? String(versionDiffTo) : ""}
                              onValueChange={(v) => { setVersionDiffTo(Number(v)); setVersionDiffResult(null); }}
                            >
                              <SelectTrigger className="h-8 w-28 text-xs" data-testid="version-diff-to">
                                <SelectValue placeholder="To" />
                              </SelectTrigger>
                              <SelectContent>
                                {versions.map((v) => (
                                  <SelectItem key={v.versionNumber} value={String(v.versionNumber)} disabled={v.versionNumber === versionDiffFrom}>
                                    v{v.versionNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={versionDiffFrom === null || versionDiffTo === null || anyPending}
                              onClick={() => versionDiffMutation.mutate()}
                              data-testid="version-diff-btn"
                            >
                              <GitCompare className={`w-3 h-3 mr-1 ${versionDiffMutation.isPending ? "animate-spin" : ""}`} />
                              {versionDiffMutation.isPending ? "Diffing..." : "Diff"}
                            </Button>
                          </div>
                          {versionDiffResult && (
                            <div className="mt-2" data-testid="version-diff-result">
                              <p className="text-[10px] text-muted-foreground mb-1">
                                v{versionDiffResult.fromVersion} → v{versionDiffResult.toVersion}
                              </p>
                              <DiffViewer diff={versionDiffResult.diff} />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {versions.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between py-1.5 px-2 rounded text-xs hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5">
                                v{v.versionNumber}
                              </Badge>
                              <span className="text-muted-foreground truncate">{v.reason}</span>
                              <span className="text-muted-foreground/60 shrink-0">
                                {new Date(v.createdAt).toLocaleTimeString()}
                              </span>
                              <span className="font-mono text-muted-foreground/40 shrink-0">
                                {v.checksum.slice(0, 8)}
                              </span>
                            </div>
                            {!isTerminal && v.checksum !== selectedDraft?.checksum && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs shrink-0 ml-2"
                                disabled={anyPending}
                                onClick={() => restoreMutation.mutate(v.versionNumber)}
                                data-testid={`restore-v${v.versionNumber}`}
                              >
                                <Undo2 className="w-3 h-3 mr-1" />
                                Restore
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Inline Edit */}
                {!isTerminal && (
                  <>
                    <Separator />
                    <div data-testid="vibe-inline-edit">
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Inline Edit
                      </h2>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Select value={editOp} onValueChange={setEditOp}>
                            <SelectTrigger className="h-9 w-44" data-testid="edit-op-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="add_field">Add Field</SelectItem>
                              <SelectItem value="rename_field">Rename Field</SelectItem>
                              <SelectItem value="remove_field">Remove Field</SelectItem>
                              <SelectItem value="set_sla">Set SLA</SelectItem>
                              <SelectItem value="set_assignment_group">Set Assignment Group</SelectItem>
                            </SelectContent>
                          </Select>

                          <Select value={editRecordType} onValueChange={setEditRecordType}>
                            <SelectTrigger className="h-9 w-44" data-testid="edit-rt-select">
                              <SelectValue placeholder="Record type" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedDraft.package.recordTypes.map((rt) => (
                                <SelectItem key={rt.key} value={rt.key}>
                                  {rt.key}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {editOp === "add_field" && (
                          <div className="flex items-center gap-2">
                            <input
                              value={editFieldName}
                              onChange={(e) => setEditFieldName(e.target.value)}
                              placeholder="Field name"
                              className="h-9 rounded-md border bg-background px-3 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-ring"
                              data-testid="edit-field-name"
                            />
                            <Select value={editFieldType} onValueChange={setEditFieldType}>
                              <SelectTrigger className="h-9 w-32" data-testid="edit-field-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">string</SelectItem>
                                <SelectItem value="number">number</SelectItem>
                                <SelectItem value="boolean">boolean</SelectItem>
                                <SelectItem value="date">date</SelectItem>
                                <SelectItem value="text">text</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {editOp === "rename_field" && (
                          <div className="flex items-center gap-2">
                            <Select value={editFieldName} onValueChange={setEditFieldName}>
                              <SelectTrigger className="h-9 flex-1" data-testid="edit-rename-from">
                                <SelectValue placeholder="Existing field" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedDraft.package.recordTypes
                                  .find((rt) => rt.key === editRecordType)
                                  ?.fields.map((f) => (
                                    <SelectItem key={f.name} value={f.name}>
                                      {f.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            <input
                              value={editNewName}
                              onChange={(e) => setEditNewName(e.target.value)}
                              placeholder="New name"
                              className="h-9 rounded-md border bg-background px-3 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-ring"
                              data-testid="edit-rename-to"
                            />
                          </div>
                        )}

                        {editOp === "remove_field" && (
                          <div className="flex items-center gap-2">
                            <Select value={editFieldName} onValueChange={setEditFieldName}>
                              <SelectTrigger className="h-9 flex-1" data-testid="edit-remove-field">
                                <SelectValue placeholder="Field to remove" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedDraft.package.recordTypes
                                  .find((rt) => rt.key === editRecordType)
                                  ?.fields.map((f) => (
                                    <SelectItem key={f.name} value={f.name}>
                                      {f.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {editOp === "set_sla" && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editSlaDuration}
                              onChange={(e) => setEditSlaDuration(Number(e.target.value))}
                              min={1}
                              className="h-9 rounded-md border bg-background px-3 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-ring"
                              data-testid="edit-sla-duration"
                            />
                            <Select value={editSlaUnit} onValueChange={setEditSlaUnit}>
                              <SelectTrigger className="h-9 w-28" data-testid="edit-sla-unit">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minutes">Minutes</SelectItem>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {editOp === "set_assignment_group" && (
                          <div className="flex items-center gap-2">
                            <input
                              value={editGroupKey}
                              onChange={(e) => setEditGroupKey(e.target.value)}
                              placeholder="Group key"
                              className="h-9 rounded-md border bg-background px-3 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-ring"
                              data-testid="edit-group-key"
                            />
                          </div>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!editRecordType || anyPending}
                          onClick={() => {
                            let op: DraftPatchOp;
                            if (editOp === "add_field") {
                              if (!editFieldName.trim()) return;
                              op = { op: "add_field", recordTypeKey: editRecordType, field: { name: editFieldName.trim(), type: editFieldType } };
                            } else if (editOp === "rename_field") {
                              if (!editFieldName || !editNewName.trim()) return;
                              op = { op: "rename_field", recordTypeKey: editRecordType, from: editFieldName, to: editNewName.trim() };
                            } else if (editOp === "remove_field") {
                              if (!editFieldName) return;
                              op = { op: "remove_field", recordTypeKey: editRecordType, fieldName: editFieldName };
                            } else if (editOp === "set_sla") {
                              const durationMinutes =
                                editSlaUnit === "hours" ? editSlaDuration * 60
                                : editSlaUnit === "days" ? editSlaDuration * 1440
                                : editSlaDuration;
                              if (durationMinutes <= 0) return;
                              op = { op: "set_sla", recordTypeKey: editRecordType, durationMinutes };
                            } else if (editOp === "set_assignment_group") {
                              if (!editGroupKey.trim()) return;
                              op = { op: "set_assignment_group", recordTypeKey: editRecordType, groupKey: editGroupKey.trim() };
                            } else {
                              return;
                            }
                            patchMutation.mutate([op]);
                          }}
                          data-testid="vibe-apply-edit-btn"
                        >
                          <Pencil className={`w-3.5 h-3.5 mr-1.5 ${patchMutation.isPending ? "animate-spin" : ""}`} />
                          {patchMutation.isPending ? "Applying..." : "Apply Edit"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="promotion" className="flex-1 m-0">
            <div className="p-6 max-w-4xl">
              {!projectId ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                  <Package className="w-10 h-10 opacity-20" />
                  <p className="text-sm">No project selected. Set a project first.</p>
                </div>
              ) : (
                <PromotionPanel projectId={projectId} />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
