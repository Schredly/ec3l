import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/AppShell";
import { useTenantBootstrap } from "@/hooks/use-tenant";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Changes from "@/pages/changes";
import ChangeDetail from "@/pages/change-detail";
import Skills from "@/pages/skills";
import Runner from "@/pages/runner";
import FormStudio from "@/pages/form-studio";
import AdminConsole from "@/pages/admin";
import WorkflowMonitor from "@/pages/workflow-monitor";
import Records from "@/pages/records";
import VibeStudio from "@/pages/vibe-studio";
import Primitives from "@/pages/primitives";
import BuilderLanding from "@/pages/BuilderLanding";
import BuilderProposal from "@/pages/BuilderProposal";
import AppDraftShell from "@/pages/AppDraftShell";

function Router() {
  return (
    <Switch>
      <Route path="/" component={BuilderLanding} />
      <Route path="/builder" component={BuilderLanding} />
      <Route path="/builder/proposal" component={BuilderProposal} />
      <Route path="/apps/:appId" component={AppDraftShell} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/changes" component={Changes} />
      <Route path="/changes/:id" component={ChangeDetail} />
      <Route path="/skills" component={Skills} />
      <Route path="/runner" component={Runner} />
      <Route path="/studio/forms" component={FormStudio} />
      <Route path="/admin/:section?" component={AdminConsole} />
      <Route path="/workflow-monitor" component={WorkflowMonitor} />
      <Route path="/records" component={Records} />
      <Route path="/vibe-studio" component={VibeStudio} />
      <Route path="/primitives" component={Primitives} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const tenantReady = useTenantBootstrap();

  if (!tenantReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <AppShell>
      <Router />
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
