import { ThemeToggle } from "@/components/theme-toggle";
import { EnvironmentSelector } from "./EnvironmentSelector";

interface TopContextBarProps {
  title?: string;
}

export function TopContextBar({ title = "Dashboard" }: TopContextBarProps) {
  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-background shrink-0">
      <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
        {title}
      </h1>
      <div className="flex items-center gap-3">
        <EnvironmentSelector />
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
          User
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
