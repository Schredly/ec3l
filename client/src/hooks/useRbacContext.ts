import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface RbacMeResponse {
  userId: string;
  roles: Array<{ id: string; name: string; status: string }>;
  permissions: string[];
}

export interface RbacContext {
  isAdmin: boolean;
  isAgent: boolean;
  canApproveChange: boolean;
  canPromoteEnvironment: boolean;
  canExecuteWorkflow: boolean;
  canApproveWorkflow: boolean;
  canViewAdmin: boolean;
  canEditForm: boolean;
  rawPermissions: string[];
  isLoading: boolean;
}

export function useRbacContext(): RbacContext {
  const isAgent = typeof window !== "undefined"
    ? !!localStorage.getItem("agentId")
    : false;

  const { data, isLoading } = useQuery<RbacMeResponse>({
    queryKey: ["/api/rbac/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 120_000,
    retry: false,
  });

  const rawPermissions = data?.permissions ?? [];
  const has = (key: string) => rawPermissions.includes(key);

  if (isLoading || !data) {
    return {
      isAdmin: false,
      isAgent,
      canApproveChange: false,
      canPromoteEnvironment: false,
      canExecuteWorkflow: false,
      canApproveWorkflow: false,
      canViewAdmin: false,
      canEditForm: false,
      rawPermissions: [],
      isLoading: true,
    };
  }

  // Agents get least privilege regardless of role permissions
  if (isAgent) {
    return {
      isAdmin: false,
      isAgent: true,
      canApproveChange: false,
      canPromoteEnvironment: false,
      canExecuteWorkflow: has("workflow.execute"),
      canApproveWorkflow: false,
      canViewAdmin: false,
      canEditForm: has("form.edit"),
      rawPermissions,
      isLoading: false,
    };
  }

  return {
    isAdmin: has("admin.view") && has("change.approve") && has("environment.promote"),
    isAgent: false,
    canApproveChange: has("change.approve"),
    canPromoteEnvironment: has("environment.promote"),
    canExecuteWorkflow: has("workflow.execute"),
    canApproveWorkflow: has("workflow.approve"),
    canViewAdmin: has("admin.view"),
    canEditForm: has("form.edit"),
    rawPermissions,
    isLoading: false,
  };
}
