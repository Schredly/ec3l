import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, Loader2, Package, LayoutGrid, Rocket, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Template {
  id: string;
  name: string;
  domain: string;
  version: string;
  description: string | null;
}

type WizardStep = "choose" | "configure" | "preview" | "install";

export default function CreateAppWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("choose");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [appName, setAppName] = useState("");

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/templates/${selectedTemplate!.id}/install`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/installed-apps"] });
      toast({ title: "App installed", description: `${selectedTemplate?.name} has been installed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Installation failed", description: err.message, variant: "destructive" });
    },
  });

  function handleSelectTemplate(template: Template) {
    setSelectedTemplate(template);
    setAppName(template.name);
    setStep("configure");
  }

  function handleConfigure() {
    setStep("preview");
  }

  function handleInstall() {
    setStep("install");
    installMutation.mutate();
  }

  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            if (step === "choose") navigate("/apps");
            else if (step === "configure") setStep("choose");
            else if (step === "preview") setStep("configure");
            else navigate("/apps");
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create App</h1>
          <p className="text-sm text-muted-foreground">
            {step === "choose" && "Choose a template to start from"}
            {step === "configure" && "Configure your app"}
            {step === "preview" && "Review before installing"}
            {step === "install" && (installMutation.isPending ? "Installing..." : installMutation.isSuccess ? "All set!" : "Installing...")}
          </p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {(["choose", "configure", "preview", "install"] as WizardStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s
                  ? "bg-blue-600 text-white"
                  : (["choose", "configure", "preview", "install"].indexOf(step) > i)
                    ? "bg-green-100 text-green-700"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {(["choose", "configure", "preview", "install"].indexOf(step) > i) ? (
                <Check className="w-3 h-3" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step: Choose Template */}
      {step === "choose" && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : !templates || templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Package className="w-10 h-10 text-muted-foreground/50 mb-3" />
                <h3 className="text-lg font-medium mb-1">No templates available</h3>
                <p className="text-sm text-muted-foreground">
                  Templates will appear here once they're published.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {templates.map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                  onClick={() => handleSelectTemplate(t)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">{t.name}</h3>
                      <Badge variant="secondary" className="text-[10px]">{t.domain}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{t.description || "No description"}</p>
                    <p className="text-xs text-muted-foreground font-mono">v{t.version}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Step: Configure */}
      {step === "configure" && selectedTemplate && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{selectedTemplate.name}</p>
                <p className="text-xs text-muted-foreground">{selectedTemplate.domain} &middot; v{selectedTemplate.version}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="app-name" className="text-sm">App Name</Label>
              <Input
                id="app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="My App"
              />
            </div>

            <Button
              onClick={handleConfigure}
              disabled={!appName.trim()}
              className="w-full gap-1.5"
            >
              Continue <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && selectedTemplate && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Install Summary
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Template</span>
                <span className="font-medium">{selectedTemplate.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">v{selectedTemplate.version}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Domain</span>
                <Badge variant="secondary" className="text-[10px]">{selectedTemplate.domain}</Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">App Name</span>
                <span className="font-medium">{appName}</span>
              </div>
            </div>

            <div className="border rounded-md p-3 bg-muted/30 text-xs text-muted-foreground">
              This will create a new project, install record types, workflows, and SLA policies
              defined by the template.
            </div>

            <Button
              onClick={handleInstall}
              className="w-full gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Install App
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Installing */}
      {step === "install" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            {installMutation.isPending ? (
              <>
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                <h3 className="text-lg font-medium mb-1">Installing...</h3>
                <p className="text-sm text-muted-foreground">
                  Setting up {selectedTemplate?.name}
                </p>
              </>
            ) : installMutation.isError ? (
              <>
                <h3 className="text-lg font-medium mb-1 text-destructive">Installation Failed</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {installMutation.error?.message}
                </p>
                <Button variant="outline" onClick={() => setStep("preview")}>
                  Try Again
                </Button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <Check className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-1">Your app is ready.</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {appName || selectedTemplate?.name} has been installed.
                </p>
                <div className="flex gap-3">
                  <Button
                    className="gap-1.5"
                    onClick={() => {
                      const key = (appName || selectedTemplate?.name || "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "");
                      navigate(`/apps/${key}`);
                    }}
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    Open App
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => navigate("/workspace")}
                  >
                    <Home className="w-3.5 h-3.5" />
                    Go to Workspace
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
