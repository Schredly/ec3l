import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

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
    </div>
  );
}
