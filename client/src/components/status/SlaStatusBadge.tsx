import { StatusBadge, type StatusSize } from "./StatusBadge";
import { getToneForSlaStatus } from "./statusTone";

interface SlaStatusBadgeProps {
  status: string | null;
  size?: StatusSize;
}

export function SlaStatusBadge({ status, size }: SlaStatusBadgeProps) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const { tone, labelOverride, title } = getToneForSlaStatus(status);
  return (
    <StatusBadge
      label={labelOverride ?? status}
      tone={tone}
      size={size}
      title={title}
    />
  );
}
