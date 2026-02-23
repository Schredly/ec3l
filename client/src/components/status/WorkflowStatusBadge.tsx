import { StatusBadge, type StatusSize } from "./StatusBadge";
import { getToneForWorkflowExecutionStatus } from "./statusTone";

interface WorkflowStatusBadgeProps {
  status: string;
  size?: StatusSize;
}

export function WorkflowStatusBadge({ status, size }: WorkflowStatusBadgeProps) {
  const { tone, labelOverride, title } = getToneForWorkflowExecutionStatus(status);
  return (
    <StatusBadge
      label={labelOverride ?? status}
      tone={tone}
      size={size}
      title={title}
    />
  );
}
