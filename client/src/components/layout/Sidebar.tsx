import { useLocation, Link } from "wouter";
import { useRbacContext } from "@/hooks/useRbacContext";
import { useMemo } from "react";

interface NavItem {
  title: string;
  url: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

function useVisibleSections(): NavSection[] {
  const rbac = useRbacContext();

  return useMemo(() => {
    const sections: NavSection[] = [];

    // Workspace — always visible
    sections.push({
      label: "Workspace",
      items: [
        { title: "Builder", url: "/" },
        { title: "Projects", url: "/projects" },
      ],
    });

    // Build — visible if user has change, form, or edit permissions
    // For least-privilege: show if any build-related permission exists, or if still loading (show optimistically)
    if (
      rbac.isLoading ||
      rbac.isAdmin ||
      rbac.canApproveChange ||
      rbac.canEditForm ||
      rbac.rawPermissions.some((p) => p.startsWith("form.") || p === "change.approve")
    ) {
      sections.push({
        label: "Build",
        items: [
          { title: "Changes", url: "/changes" },
          { title: "Primitives", url: "/primitives" },
          { title: "Form Studio", url: "/studio/forms" },
          { title: "Runner", url: "/runner" },
        ],
      });
    }

    // AI — visible if user can execute workflows or has edit permissions
    // Agents can see AI section (they can execute workflows)
    if (
      rbac.isLoading ||
      rbac.isAdmin ||
      rbac.canExecuteWorkflow ||
      rbac.canEditForm ||
      rbac.canApproveWorkflow
    ) {
      sections.push({
        label: "AI",
        items: [
          { title: "Vibe Studio", url: "/vibe-studio" },
          { title: "Agent Skills", url: "/skills" },
        ],
      });
    }

    // Govern — visible if canViewAdmin or canPromoteEnvironment
    // Agents: hide entire Govern section
    if (!rbac.isAgent) {
      const governItems: NavItem[] = [];

      if (rbac.isLoading || rbac.canViewAdmin) {
        governItems.push({ title: "Admin", url: "/admin" });
      }

      if (
        rbac.isLoading ||
        rbac.canExecuteWorkflow ||
        rbac.canApproveChange ||
        rbac.canApproveWorkflow
      ) {
        governItems.push({ title: "Workflow Monitor", url: "/workflow-monitor" });
      }

      // Records — always visible for non-agents
      governItems.push({ title: "Records", url: "/records" });

      if (governItems.length > 0) {
        sections.push({ label: "Govern", items: governItems });
      }
    }

    return sections;
  }, [rbac]);
}

export function Sidebar() {
  const [location] = useLocation();
  const sections = useVisibleSections();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <aside className="flex flex-col w-60 shrink-0 h-full bg-gray-50 border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-14 shrink-0 border-b border-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary">
          <span className="text-[11px] font-bold text-primary-foreground leading-none">E3</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight leading-tight">ec3l.ai</span>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase leading-tight">
            ChangeOps
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            <div className="px-2 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    className={`
                      block px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors
                      ${
                        isActive(item.url)
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-foreground"
                      }
                    `}
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="font-mono text-[11px]">System Online</span>
        </div>
      </div>
    </aside>
  );
}
