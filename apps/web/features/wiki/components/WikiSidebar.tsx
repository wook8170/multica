"use client";

import { useMemo, useState, useCallback } from "react";
import { FileText, Plus, Search, ChevronRight, ChevronDown, Loader2, Trash2, Copy, X, Check } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { useWikiStore } from "../store";
import { cn } from "@multica/ui/lib/utils";

interface WikiNode {
  id: string;
  title: string;
  content: string;
  parent_id?: string | null;
  children?: WikiNode[];
  isPending?: boolean;
}

interface WikiSidebarProps {
  nodes: WikiNode[];
  isLoading: boolean;
  onCreateNew: (parentId: string | null) => void;
  onSelect: (node: WikiNode) => void;
  selectedId: string | null;
  isCollaborating: boolean;
  onDeleteMultiple?: (ids: string[]) => void;
  onDuplicateMultiple?: (ids: string[]) => void;
}

export function WikiSidebar({
  nodes, isLoading, onCreateNew, onSelect, selectedId, isCollaborating,
  onDeleteMultiple, onDuplicateMultiple,
}: WikiSidebarProps) {
  const { searchQuery, setSearchQuery, expandedNodes, toggleNode } = useWikiStore();
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const isSelecting = multiSelected.size > 0;

  const toggleMultiSelect = useCallback((id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setMultiSelected(new Set());

  const handleDeleteMultiple = () => {
    const ids = [...multiSelected];
    onDeleteMultiple?.(ids);
    clearSelection();
  };

  const handleDuplicateMultiple = () => {
    const ids = [...multiSelected];
    onDuplicateMultiple?.(ids);
    clearSelection();
  };

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const filter = (items: WikiNode[]): WikiNode[] =>
      items.reduce((acc, node) => {
        const matches = node.title.toLowerCase().includes(searchQuery.toLowerCase());
        const filteredChildren = node.children ? filter(node.children) : [];
        if (matches || filteredChildren.length > 0) acc.push({ ...node, children: filteredChildren });
        return acc;
      }, [] as WikiNode[]);
    return filter(nodes);
  }, [nodes, searchQuery]);

  const renderTree = (items: WikiNode[], level = 0): React.ReactNode => {
    return items.map((node) => {
      const isExpanded = expandedNodes.has(node.id);
      const hasChildren = (node.children?.length ?? 0) > 0;
      const isSelected = selectedId === node.id;
      const isChecked = multiSelected.has(node.id);
      const canSelect = !node.isPending; // pending docs can't be multi-selected

      return (
        <div key={node.id} className="flex flex-col">
          <div
            onClick={() => {
              if (isSelecting && canSelect) {
                toggleMultiSelect(node.id);
              } else if (!isSelecting) {
                onSelect(node);
              }
            }}
            className={cn(
              "group relative flex w-full cursor-pointer items-center gap-1.5 py-1.5 px-2 rounded-md transition-colors select-none",
              isSelected && !isSelecting ? "bg-primary/10" : "",
              isChecked ? "bg-primary/8" : "",
              !isChecked ? "hover:bg-muted" : "",
            )}
            style={{ marginLeft: `${level * 12}px` }}
          >
            {/* Expand/collapse toggle */}
            <div
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors",
                hasChildren && !isSelecting ? "cursor-pointer hover:bg-muted-foreground/10" : "opacity-0 pointer-events-none",
              )}
              onClick={(e) => {
                if (hasChildren && !isSelecting) {
                  e.stopPropagation();
                  toggleNode(node.id);
                }
              }}
            >
              {hasChildren && !isSelecting && (
                isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
              )}
            </div>

            {/* File icon ↔ checkbox */}
            <div
              className="relative size-3.5 shrink-0 cursor-pointer"
              onClick={(e) => {
                if (!canSelect) return;
                e.stopPropagation();
                toggleMultiSelect(node.id);
              }}
            >
              {/* File icon — hidden on hover or when selecting */}
              <FileText className={cn(
                "size-3.5 absolute inset-0 transition-opacity duration-100",
                isSelected ? "text-primary" : "text-muted-foreground",
                isSelecting || isChecked ? "opacity-0" : canSelect ? "group-hover:opacity-0" : "",
              )} />

              {/* Checkbox — shown on hover or when selecting */}
              {canSelect && (
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity duration-100",
                  isSelecting || isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}>
                  <div className={cn(
                    "size-3.5 rounded border-2 flex items-center justify-center transition-colors",
                    isChecked ? "bg-primary border-primary" : "border-muted-foreground/40 bg-background",
                  )}>
                    {isChecked && <Check className="size-2 text-white stroke-[3]" />}
                  </div>
                </div>
              )}
            </div>

            {/* Title */}
            <span className={cn(
              "text-xs truncate flex-1 font-medium transition-colors",
              node.isPending ? "italic text-muted-foreground/50" : "",
              isSelected && !isSelecting ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-foreground",
            )}>
              {node.title || "Untitled"}
            </span>

            {/* Green dot — shown when 2+ people editing this document */}
            {isSelected && isCollaborating && !isSelecting && (
              <div className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Multiple editors active" />
            )}

            {/* Add child button */}
            {!isSelecting && !node.isPending && (
              <Button
                size="icon"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:bg-muted hover:text-primary shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateNew(node.id);
                }}
              >
                <Plus className="size-3" />
              </Button>
            )}
          </div>

          {hasChildren && isExpanded && (
            <div>{renderTree(node.children!, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between px-3 border-b gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="text-xs font-semibold tracking-tight text-foreground truncate">Documents</h1>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onCreateNew(null)}
          className="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-primary shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-muted border-none focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Document tree */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 opacity-40">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          renderTree(filteredTree)
        )}
      </div>

      {/* Multi-select action bar */}
      {isSelecting && (
        <div className="shrink-0 border-t px-3 py-2 flex items-center gap-1.5 bg-muted/40">
          <span className="text-xs text-muted-foreground flex-1 font-medium">
            {multiSelected.size} selected
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleDuplicateMultiple}
            title="Duplicate selected"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDeleteMultiple}
            title="Delete selected"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            onClick={clearSelection}
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
