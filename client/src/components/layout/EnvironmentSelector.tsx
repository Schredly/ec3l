import { useEnvironmentContext, type EnvironmentLabel } from "@/hooks/useEnvironmentContext";
import { useState } from "react";

const ENV_STYLES: Record<EnvironmentLabel, { bg: string; text: string; border: string; dot: string }> = {
  DEV: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-400",
  },
  TEST: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-400",
  },
  PROD: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-400",
  },
};

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap bg-gray-900 text-white z-50 pointer-events-none"
        >
          {text}
        </div>
      )}
    </div>
  );
}

export function EnvironmentSelector() {
  const { environment, hasDrift, pendingPromotions, isLoading } = useEnvironmentContext();
  const style = ENV_STYLES[environment];

  if (isLoading) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-400 border border-gray-200 animate-pulse">
        ...
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {/* Environment pill */}
      <span
        className={`
          relative inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
          text-[11px] font-semibold tracking-wide border cursor-default
          transition-all duration-150 hover:brightness-95
          ${style.bg} ${style.text} ${style.border}
        `}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {environment}

        {/* Drift indicator — red dot in upper right */}
        {hasDrift && (
          <Tooltip text="Environment drift detected">
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          </Tooltip>
        )}
      </span>

      {/* Pending promotions badge */}
      {pendingPromotions > 0 && (
        <Tooltip text={`${pendingPromotions} pending promotion${pendingPromotions !== 1 ? "s" : ""}`}>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 cursor-default transition-all duration-150 hover:brightness-95">
            {pendingPromotions}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
