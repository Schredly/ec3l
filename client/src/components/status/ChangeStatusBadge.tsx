import { StatusBadge, type StatusSize } from "./StatusBadge";
import { getToneForChangeStatus } from "./statusTone";

interface ChangeStatusBadgeProps {
  status: string;
  size?: StatusSize;
}

export function ChangeStatusBadge({ status, size }: ChangeStatusBadgeProps) {
  const { tone, labelOverride, title } = getToneForChangeStatus(status);
  return (
    <StatusBadge
      label={labelOverride ?? status}
      tone={tone}
      size={size}
      title={title}
    />
  );
}
