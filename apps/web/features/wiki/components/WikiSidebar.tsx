"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import {
  FileText, Plus, Search, ChevronRight, ChevronDown,
  Loader2, Trash2, Copy, X, Check, GripVertical,
} from "lucide-react";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { useWikiStore } from "../store";
import { cn } from "@multica/ui/lib/utils";

interface WikiNode {
  id: string;
  title: string;
  content: string;
  parent_id?: string | null;
  sort_order?: number;
  children?: WikiNode[];
  isPending?: boolean;
}

interface FlatItem {
  id: string;
  title: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  hasChildren: boolean;
  childCount: number;
  isPending?: boolean;
}

type DropPosition = "before" | "child" | "after";

interface DropIndicator {
  overId: string;
  position: DropPosition;
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
  onMove?: (moves: { id: string; parentId: string | null; sortOrder: number }[]) => void;
}

function countNodes(items: WikiNode[]): number {
  return items.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);
}

function flattenVisible(
  items: WikiNode[],
  expandedNodes: Set<string>,
  depth = 0,
  parentId: string | null = null,
): FlatItem[] {
  const result: FlatItem[] = [];
  for (const item of items) {
    const children = item.children ?? [];
    const hasChildren = children.length > 0;
    result.push({
      id: item.id,
      title: item.title,
      parentId,
      depth,
      sortOrder: item.sort_order ?? 0,
      hasChildren,
      childCount: children.length,
      isPending: item.isPending,
    });
    if (hasChildren && expandedNodes.has(item.id)) {
      result.push(...flattenVisible(children, expandedNodes, depth + 1, item.id));
    }
  }
  return result;
}

/** Returns true if targetId is in the subtree rooted at any node in sourceIds */
function isDescendantOfAny(nodes: WikiNode[], sourceIds: Set<string>, targetId: string): boolean {
  for (const srcId of sourceIds) {
    if (containsId(findNode(nodes, srcId)?.children ?? [], targetId)) return true;
  }
  return false;
}

function findNode(nodes: WikiNode[], id: string): WikiNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children ?? [], id);
    if (found) return found;
  }
  return null;
}

function containsId(nodes: WikiNode[], id: string): boolean {
  for (const n of nodes) {
    if (n.id === id) return true;
    if (containsId(n.children ?? [], id)) return true;
  }
  return false;
}

/** Compute sort_order values for N items dropped between prev and next */
function computeSortOrders(prev: number | null, next: number | null, count: number): number[] {
  const lo = prev ?? (next != null ? next - count * 1000 : 0);
  const hi = next ?? lo + count * 1000;
  const step = (hi - lo) / (count + 1);
  if (step < 1) {
    // Tight gap — just stack after prev
    return Array.from({ length: count }, (_, i) => (prev ?? 0) + (i + 1));
  }
  return Array.from({ length: count }, (_, i) => Math.round(lo + step * (i + 1)));
}

export function WikiSidebar({
  nodes, isLoading, onCreateNew, onSelect, selectedId, isCollaborating,
  onDeleteMultiple, onDuplicateMultiple, onMove,
}: WikiSidebarProps) {
  const { searchQuery, setSearchQuery, expandedNodes, toggleNode, setExpandedNodes } = useWikiStore();
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const isSelecting = multiSelected.size > 0;
  const totalCount = countNodes(nodes);

  // DnD state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  // Ref for reliable synchronous read in handleDragEnd (avoids stale closure on state)
  const dropIndicatorRef = useRef<DropIndicator | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const toggleMultiSelect = useCallback((id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setMultiSelected(new Set());

  const handleDeleteMultiple = () => { onDeleteMultiple?.([...multiSelected]); clearSelection(); };
  const handleDuplicateMultiple = () => { onDuplicateMultiple?.([...multiSelected]); clearSelection(); };

  // Filtered tree for search
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

  const flatItems = useMemo(
    () => flattenVisible(filteredTree, expandedNodes),
    [filteredTree, expandedNodes],
  );

  // --- DnD handlers ---

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id));
  }, []);

  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over) {
      setDropIndicator(null);
      dropIndicatorRef.current = null;
      return;
    }
    const overRect = over.rect;
    // Use center of dragged element to determine drop zone (reliable unlike pointer coords)
    const activeTranslated = active.rect.current.translated;
    if (!overRect || !activeTranslated) {
      setDropIndicator(null);
      dropIndicatorRef.current = null;
      return;
    }
    const activeCenter = activeTranslated.top + activeTranslated.height / 2;
    const relY = activeCenter - overRect.top;
    const pct = relY / overRect.height;

    let position: DropPosition;
    if (pct < 0.3) position = "before";
    else if (pct > 0.7) position = "after";
    else position = "child";

    const indicator: DropIndicator = { overId: String(over.id), position };
    setDropIndicator(indicator);
    dropIndicatorRef.current = indicator;
  }, []);

  const handleDragEnd = useCallback(({ active }: DragEndEvent) => {
    const activeId = String(active.id);
    setActiveDragId(null);

    // Use ref (not state) to get the latest indicator without stale-closure risk
    const indicator = dropIndicatorRef.current;
    setDropIndicator(null);
    dropIndicatorRef.current = null;

    if (!indicator || !onMove) return;

    const { overId, position } = indicator;

    if (activeId === overId) return; // dropped on itself

    // Determine which IDs are being moved (multi-select or single)
    const draggedIds = (multiSelected.has(activeId) ? [...multiSelected] : [activeId])
      .filter(id => id !== overId);

    // Guard against dropping onto a descendant
    if (isDescendantOfAny(nodes, new Set(draggedIds), overId)) return;

    const overItem = flatItems.find(i => i.id === overId);
    if (!overItem) return;

    // New parent
    const newParentId = position === "child" ? overId : overItem.parentId;

    // Find siblings of the target parent (excluding items being moved)
    const siblings = flatItems
      .filter(i => i.parentId === newParentId && !draggedIds.includes(i.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let prevSortOrder: number | null = null;
    let nextSortOrder: number | null = null;

    if (position === "child") {
      // Insert as first child of overId — go before existing first child
      nextSortOrder = siblings[0]?.sortOrder ?? null;
    } else if (position === "before") {
      const idx = siblings.findIndex(i => i.id === overId);
      prevSortOrder = siblings[idx - 1]?.sortOrder ?? null;
      nextSortOrder = siblings[idx]?.sortOrder ?? null;
    } else {
      // after
      const idx = siblings.findIndex(i => i.id === overId);
      prevSortOrder = siblings[idx]?.sortOrder ?? null;
      nextSortOrder = siblings[idx + 1]?.sortOrder ?? null;
    }

    const sortOrders = computeSortOrders(prevSortOrder, nextSortOrder, draggedIds.length);

    // Preserve original relative order for multi-select
    const orderedDraggedIds = [...draggedIds].sort((a, b) => {
      const ai = flatItems.findIndex(i => i.id === a);
      const bi = flatItems.findIndex(i => i.id === b);
      return ai - bi;
    });

    const moves = orderedDraggedIds.map((id, i) => ({
      id,
      parentId: newParentId,
      sortOrder: sortOrders[i]!,
    }));

    onMove(moves);

    // Auto-expand new parent
    if (newParentId && position === "child") {
      const next = new Set(expandedNodes);
      next.add(newParentId);
      setExpandedNodes(next);
    }

    if (isSelecting) clearSelection();
  }, [multiSelected, flatItems, nodes, expandedNodes, setExpandedNodes, onMove, isSelecting]);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setDropIndicator(null);
    dropIndicatorRef.current = null;
  }, []);

  // The active drag item info (for overlay)
  const activeDragItem = activeDragId ? flatItems.find(i => i.id === activeDragId) : null;
  const dragCount = multiSelected.has(activeDragId ?? "") ? multiSelected.size : 1;

  return (
    <div
      className="flex flex-col h-full bg-background"
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Documents</h1>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{totalCount}</span>
          )}
        </div>
        <Button size="icon-xs" variant="ghost" onClick={() => onCreateNew(null)} className="text-muted-foreground">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm bg-muted border-none focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Document tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 opacity-40">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {flatItems.map((item) => {
              const isSelected = selectedId === item.id;
              const isChecked = multiSelected.has(item.id);
              const canSelect = !item.isPending;
              const isDragging = activeDragId === item.id;
              const indicator = dropIndicator?.overId === item.id ? dropIndicator : null;

              return (
                <WikiDndItem
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  isChecked={isChecked}
                  canSelect={canSelect}
                  isDragging={isDragging}
                  isSelecting={isSelecting}
                  isCollaborating={isCollaborating}
                  dropIndicator={indicator}
                  expandedNodes={expandedNodes}
                  onSelect={() => {
                    if (isSelecting && canSelect) { toggleMultiSelect(item.id); }
                    else if (!isSelecting) {
                      const node = findNode(nodes, item.id);
                      if (node) onSelect(node);
                    }
                  }}
                  onToggleExpand={() => toggleNode(item.id)}
                  onToggleCheck={() => { if (canSelect) toggleMultiSelect(item.id); }}
                  onCreateChild={() => onCreateNew(item.id)}
                />
              );
            })}

            <DragOverlay dropAnimation={null}>
              {activeDragItem && (
                <div className="flex items-center gap-2 px-4 py-2 bg-background border border-primary/30 rounded-md shadow-lg opacity-95 text-sm font-medium text-foreground max-w-[260px]">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{activeDragItem.title || "Untitled"}</span>
                  {dragCount > 1 && (
                    <span className="ml-auto shrink-0 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold">
                      {dragCount}
                    </span>
                  )}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Multi-select action bar */}
      {isSelecting && (
        <div className="shrink-0 border-t px-4 py-2 flex items-center gap-1.5 bg-muted/40">
          <span className="text-sm text-muted-foreground flex-1">{multiSelected.size} selected</span>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleDuplicateMultiple} title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteMultiple} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={clearSelection} title="Clear">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Individual draggable + droppable tree item
// ──────────────────────────────────────────────────────────────────────────────

function WikiDndItem({
  item, isSelected, isChecked, canSelect, isDragging, isSelecting,
  isCollaborating, dropIndicator, expandedNodes,
  onSelect, onToggleExpand, onToggleCheck, onCreateChild,
}: {
  item: FlatItem;
  isSelected: boolean;
  isChecked: boolean;
  canSelect: boolean;
  isDragging: boolean;
  isSelecting: boolean;
  isCollaborating: boolean;
  dropIndicator: DropIndicator | null;
  expandedNodes: Set<string>;
  onSelect: () => void;
  onToggleExpand: () => void;
  onToggleCheck: () => void;
  onCreateChild: () => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id: item.id,
    disabled: !!item.isPending,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: item.id, disabled: !!item.isPending });

  const ref = useCallback((node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const isExpanded = expandedNodes.has(item.id);

  return (
    <div
      ref={ref}
      className="relative"
      style={{ transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined }}
    >
      {/* Before-drop indicator */}
      {dropIndicator?.position === "before" && (
        <div className="pointer-events-none absolute top-0 inset-x-0 z-20 h-0.5 bg-primary rounded-full" />
      )}

      <div
        onClick={onSelect}
        className={cn(
          "group relative flex w-full cursor-pointer items-center gap-2 py-2 pr-3 transition-colors select-none",
          isDragging ? "opacity-40" : "",
          dropIndicator?.position === "child" ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "",
          isSelected && !isSelecting && dropIndicator?.position !== "child" ? "bg-primary/10" : "",
          isChecked ? "bg-primary/8" : "",
          !isChecked && dropIndicator?.position !== "child" ? "hover:bg-muted" : "",
        )}
        style={{ paddingLeft: `${16 + item.depth * 14}px` }}
      >
        {/* Child-drop hint label */}
        {dropIndicator?.position === "child" && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-primary/70 z-10">
            nest inside ↩
          </span>
        )}
        {/* Drag handle */}
        {!item.isPending && (
          <div
            className="opacity-0 group-hover:opacity-30 hover:!opacity-70 cursor-grab active:cursor-grabbing shrink-0 -ml-1 text-muted-foreground"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-3.5" />
          </div>
        )}

        {/* Expand/collapse */}
        <div
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors",
            item.hasChildren && !isSelecting ? "cursor-pointer hover:bg-muted-foreground/10" : "opacity-0 pointer-events-none",
          )}
          onClick={(e) => { if (item.hasChildren && !isSelecting) { e.stopPropagation(); onToggleExpand(); } }}
        >
          {item.hasChildren && !isSelecting && (
            isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
          )}
        </div>

        {/* File icon ↔ checkbox */}
        <div
          className="relative size-4 shrink-0 cursor-pointer"
          onClick={(e) => { if (!canSelect) return; e.stopPropagation(); onToggleCheck(); }}
        >
          <FileText className={cn(
            "size-4 absolute inset-0 transition-opacity duration-100",
            isSelected ? "text-primary" : "text-muted-foreground",
            isSelecting || isChecked ? "opacity-0" : canSelect ? "group-hover:opacity-0" : "",
          )} />
          {canSelect && (
            <div className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-100",
              isSelecting || isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}>
              <div className={cn(
                "size-4 rounded border-2 flex items-center justify-center transition-colors",
                isChecked ? "bg-primary border-primary" : "border-muted-foreground/40 bg-background",
              )}>
                {isChecked && <Check className="size-2.5 text-white stroke-[3]" />}
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <span className={cn(
          "text-sm truncate flex-1 transition-colors",
          item.isPending ? "italic text-muted-foreground/50" : "",
          isSelected && !isSelecting ? "text-primary font-medium" : "text-muted-foreground group-hover:text-foreground",
        )}>
          {item.title || "Untitled"}
        </span>

        {/* Child count */}
        {item.hasChildren && !isSelecting && (
          <span className="shrink-0 text-xs text-muted-foreground/50 tabular-nums">{item.childCount}</span>
        )}

        {/* Collab dot */}
        {isSelected && isCollaborating && !isSelecting && (
          <div className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Multiple editors active" />
        )}

        {/* Add child */}
        {!isSelecting && !item.isPending && (
          <Button
            size="icon"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:bg-muted hover:text-primary shrink-0"
            onClick={(e) => { e.stopPropagation(); onCreateChild(); }}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>

      {/* After-drop indicator */}
      {dropIndicator?.position === "after" && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20 h-0.5 bg-primary rounded-full" />
      )}
    </div>
  );
}
