import { cn } from "@multica/ui/lib/utils";

interface PageListHeaderProps {
  title: string;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard header for list panel pages (Agents, Skills, Runtimes, Inbox, Projects, etc.)
 * Provides consistent h-12 height, typography, and spacing.
 *
 * Usage:
 *   <PageListHeader title="Agents" count={5} actions={<Button>...</Button>} />
 */
export function PageListHeader({ title, count, actions, className }: PageListHeaderProps) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center justify-between border-b px-4", className)}>
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold">{title}</h1>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-1">{actions}</div>
      )}
    </div>
  );
}
