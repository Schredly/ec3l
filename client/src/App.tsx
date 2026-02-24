import { useEffect, useLayoutEffect, useRef } from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient, setTenantId } from "./lib/queryClient";
import { setActiveTenantSlug } from "./lib/activeTenant";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/AppShell";
import { TenantProvider, useTenantContext } from "@/tenant/tenantStore";
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
import SharedPrimitives from "@/pages/SharedPrimitives";
import BuilderLanding from "@/pages/BuilderLanding";
import BuilderProposal from "@/pages/BuilderProposal";
import AppDraftShell from "@/pages/AppDraftShell";

/**
 * Syncs the URL tenant slug to module-level state and TenantProvider context.
 *
 * 1. During render: sets module-level slug so tenantHeaders() is correct
 *    before any child queries fire.
 * 2. useLayoutEffect: persists to localStorage and clears query cache on
 *    actual tenant switch (before browser paint).
 * 3. useEffect: fetches tenant list to validate slug and hydrate
 *    TenantProvider with full info (id, name).
 */
function TenantRouteSync({ tenantSlug }: { tenantSlug: string }) {
  const { activeTenant, setActiveTenant } = useTenantContext();
  const prevSlugRef = useRef<string | undefined>(undefined);

  // Synchronous: set module-level slug so every tenantHeaders() call
  // returns the correct value — even during this render cycle.
  setActiveTenantSlug(tenantSlug);

  // Before paint: persist to localStorage and clear stale cache on switch.
  useLayoutEffect(() => {
    if (prevSlugRef.current !== undefined && prevSlugRef.current !== tenantSlug) {
      queryClient.clear();
    }
    setTenantId(tenantSlug);
    prevSlugRef.current = tenantSlug;
  }, [tenantSlug]);

  // Fetch tenant list to validate slug and get full info (id, name).
  const { data: tenants } = useQuery<{ id: string; slug: string; name: string }[]>({
    queryKey: ["tenants-list"],
    queryFn: async () => {
      const res = await fetch("/api/tenants");
      if (!res.ok) throw new Error("Failed to fetch tenants");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Hydrate TenantProvider context with full tenant info once available.
  useEffect(() => {
    if (!tenants) return;
    if (activeTenant?.slug === tenantSlug) return;

    const tenant = tenants.find((t) => t.slug === tenantSlug);
    if (tenant) {
      setActiveTenant({ id: tenant.id, slug: tenant.slug, name: tenant.name });
    }
  }, [tenantSlug, tenants, activeTenant?.slug, setActiveTenant]);

  return null;
}

/** All routes scoped under /t/:tenantSlug. Paths are relative to the nest. */
function TenantScopedRoutes({ tenantSlug }: { tenantSlug: string }) {
  return (
    <>
      <TenantRouteSync tenantSlug={tenantSlug} />
      <AppShell>
        <Switch>
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
          <Route path="/shared-primitives" component={SharedPrimitives} />
          {/* Bare /t/:tenantSlug/ → redirect to builder */}
          <Route path="/">
            <Redirect to="/builder" />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </>
  );
}

/** Redirects bare "/" (or any non-scoped path) to /t/{slug}/builder. */
function RootRedirect() {
  const slug = localStorage.getItem("tenantId") || "default";
  return <Redirect to={`/t/${slug}/builder`} />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <TooltipProvider>
            <Switch>
              <Route path="/t/:tenantSlug" nest>
                {({ tenantSlug }) => (
                  <TenantScopedRoutes tenantSlug={tenantSlug} />
                )}
              </Route>
              <Route>
                <RootRedirect />
              </Route>
            </Switch>
            <Toaster />
          </TooltipProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
