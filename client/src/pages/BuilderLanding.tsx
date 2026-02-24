import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listDrafts, type VibeDraft } from "@/lib/api/vibe";
import { VibeDraftStatusBadge } from "@/components/status/VibeDraftStatusBadge";

const TEMPLATES: { name: string; description: string; prompt: string }[] = [
  {
    name: "ITSM",
    description: "IT service desk with incidents, requests, and problems",
    prompt:
      "IT service desk for 300 employees with incident management, service request fulfillment, problem tracking, SLA enforcement, and manager approvals for priority 1 incidents.",
  },
  {
    name: "HR",
    description: "Employee onboarding and case management",
    prompt:
      "HR case management system with employee onboarding workflows, document collection, manager approvals, and compliance tracking across departments.",
  },
  {
    name: "Facilities",
    description: "Maintenance requests with approval routing",
    prompt:
      "Facilities maintenance application with work order tracking, approval routing for high-cost repairs, vendor assignment, and SLA-based escalation.",
  },
  {
    name: "Blank App",
    description: "Start from scratch with an empty workspace",
    prompt: "",
  },
];

function humanizeKey(key: string): string {
  return key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RecentDrafts() {
  const [, navigate] = useLocation();
  const { data: drafts, isLoading } = useQuery<VibeDraft[]>({
    queryKey: ["/api/vibe/drafts"],
    queryFn: () => listDrafts(),
  });

  const visible = drafts
    ?.filter((d) => d.status !== "discarded")
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="w-full mt-12 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!visible || visible.length === 0) return null;

  return (
    <div className="w-full mt-12">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
        Recent Drafts
      </p>
      <div className="space-y-2">
        {visible.map((draft) => (
          <Card
            key={draft.id}
            className="cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/40"
            onClick={() => navigate(`/apps/${draft.id}`)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-sm font-medium truncate">
                  {humanizeKey(draft.package.packageKey)}
                </p>
                <span className="text-xs text-muted-foreground shrink-0">
                  v{draft.package.version}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <VibeDraftStatusBadge status={draft.status} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {timeAgo(draft.updatedAt)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function BuilderLanding() {
  const [prompt, setPrompt] = useState("");
  const [, navigate] = useLocation();

  function handleGenerate() {
    if (!prompt.trim()) return;
    navigate(`/builder/proposal?prompt=${encodeURIComponent(prompt.trim())}`);
  }

  function handleTemplate(template: (typeof TEMPLATES)[number]) {
    if (template.prompt) {
      setPrompt(template.prompt);
    } else {
      navigate("/apps/dev-draft");
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-center">
        Build Your Enterprise System
      </h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">
        Describe the system you want to create.
      </p>

      <div className="w-full mt-10 space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="IT service desk for 300 employees&#10;Vendor onboarding workflow&#10;Facilities maintenance app with approvals"
          className="min-h-[140px] resize-y text-sm"
        />
        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          className="w-full"
        >
          Generate Proposal
        </Button>
      </div>

      <div className="w-full mt-12">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
          Or start from a template
        </p>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <Card
              key={t.name}
              className="cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              onClick={() => handleTemplate(t)}
            >
              <CardContent className="p-4">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <RecentDrafts />
    </div>
  );
}
