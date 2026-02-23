import { StatusBadge, type StatusSize } from "./StatusBadge";
import { getToneForPromotionIntentStatus } from "./statusTone";

interface PromotionIntentStatusBadgeProps {
  status: string;
  size?: StatusSize;
}

export function PromotionIntentStatusBadge({ status, size }: PromotionIntentStatusBadgeProps) {
  const { tone, labelOverride, title } = getToneForPromotionIntentStatus(status);
  return (
    <StatusBadge
      label={labelOverride ?? status}
      tone={tone}
      size={size}
      title={title}
    />
  );
}
