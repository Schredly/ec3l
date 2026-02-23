import { StatusBadge, type StatusSize } from "./StatusBadge";
import { getToneForVibeDraftStatus } from "./statusTone";

interface VibeDraftStatusBadgeProps {
  status: string;
  size?: StatusSize;
}

export function VibeDraftStatusBadge({ status, size }: VibeDraftStatusBadgeProps) {
  const { tone, labelOverride, title } = getToneForVibeDraftStatus(status);
  return (
    <StatusBadge
      label={labelOverride ?? status}
      tone={tone}
      size={size}
      title={title}
    />
  );
}
