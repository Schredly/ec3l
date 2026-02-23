import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";
export type StatusSize = "sm" | "md";

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  size?: StatusSize;
  icon?: ReactNode;
  title?: string;
}

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-gray-50 text-gray-700 border-gray-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  ai: "bg-violet-50 text-violet-700 border-violet-200",
};

const SIZE_CLASSES: Record<StatusSize, string> = {
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

export function StatusBadge({ label, tone, size = "sm", icon, title }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium leading-none whitespace-nowrap ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}`}
      title={title}
    >
      {icon}
      {label}
    </span>
  );
}
