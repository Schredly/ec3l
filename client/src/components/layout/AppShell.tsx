import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopContextBar } from "./TopContextBar";

interface AppShellProps {
  title?: string;
  children: ReactNode;
}

export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopContextBar title={title} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
