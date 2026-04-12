"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Plus, Search, ChevronRight, ChevronDown,
  Loader2, Trash2, Copy, X, Check, GripVertical, FileText,
} from "lucide-react";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { ActorAvatar } from "@multica/views/common/actor-avatar";
import { useWikiStore } from "../store";
import { cn } from "@multica/ui/lib/utils";

interface WikiNode {
  id: string;
  title: string;
  content: string;
  parent_id?: string | null;
  sort_order?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
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
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  isPending?: boolean;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
      createdBy: item.created_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
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
  // Track real pointer Y at document level — reliable even when @dnd-kit captures pointer events
  const pointerYRef = useRef(0);
  useEffect(() => {
    const onMove = (e: PointerEvent) => { pointerYRef.current = e.clientY; };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

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

  // onDragMove fires on every pointer move — needed to re-evaluate before/child/after
  // within the same target item (onDragOver only fires when the target changes).
  const handleDragMove = useCallback(({ over }: DragMoveEvent) => {
    if (!over) {
      if (dropIndicatorRef.current !== null) {
        setDropIndicator(null);
        dropIndicatorRef.current = null;
      }
      return;
    }
    const overRect = over.rect;
    if (!overRect) return;

    const relY = pointerYRef.current - overRect.top;
    const pct = relY / overRect.height;

    let position: DropPosition;
    if (pct < 0.28) position = "before";
    else if (pct > 0.72) position = "after";
    else position = "child";

    const overId = String(over.id);
    // Skip state update if nothing changed (avoids excessive re-renders)
    const cur = dropIndicatorRef.current;
    if (cur?.overId === overId && cur?.position === position) return;

    const indicator: DropIndicator = { overId, position };
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

    // Siblings in current visual order (flatItems is already ordered correctly by the server).
    // We do NOT rely on sortOrder values from the DB — they may all be 0 for legacy items.
    // Instead we use the visual-position index (×1000) as canonical sort order.
    const siblingsOrdered = flatItems.filter(
      i => i.parentId === newParentId && !draggedIds.includes(i.id),
    );

    // Find insert index within siblings
    let insertIdx: number;
    if (position === "child") {
      insertIdx = 0; // prepend as first child
    } else {
      const overIdx = siblingsOrdered.findIndex(i => i.id === overId);
      insertIdx = position === "before" ? overIdx : overIdx + 1;
    }

    // Preserve original relative order for multi-select
    const orderedDraggedIds = [...draggedIds].sort((a, b) => {
      const ai = flatItems.findIndex(i => i.id === a);
      const bi = flatItems.findIndex(i => i.id === b);
      return ai - bi;
    });

    // Build the complete new ordered list for this parent and assign clean sort_orders.
    // Renormalising ALL siblings every move keeps DB values always clean.
    const newSiblingList: string[] = [...siblingsOrdered.map(s => s.id)];
    newSiblingList.splice(insertIdx, 0, ...orderedDraggedIds);

    const moves = newSiblingList.map((id, idx) => ({
      id,
      parentId: newParentId,
      sortOrder: (idx + 1) * 1000,
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
            onDragMove={handleDragMove}
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
          "group relative flex w-full cursor-pointer items-center gap-3 py-2.5 pr-3 transition-colors select-none",
          isDragging ? "opacity-40" : "",
          dropIndicator?.position === "child" ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "",
          isSelected && !isSelecting && dropIndicator?.position !== "child" ? "bg-accent" : "",
          isChecked ? "bg-primary/8" : "",
          !isChecked && dropIndicator?.position !== "child" ? "hover:bg-accent/50" : "",
        )}
        style={{ paddingLeft: `${16 + item.depth * 16}px` }}
      >
        {/* Child-drop hint label */}
        {dropIndicator?.position === "child" && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-primary/70 z-10">
            nest inside ↩
          </span>
        )}
        {/* Drag handle — absolutely positioned over the indent padding */}
        {!item.isPending && (
          <div
            className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 hover:!opacity-70 cursor-grab active:cursor-grabbing text-muted-foreground z-10"
            style={{ left: `${2 + item.depth * 16}px` }}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-3.5" />
          </div>
        )}

        {/* Expand/collapse — in flex flow, always visible for items with children */}
        {item.hasChildren && !isSelecting ? (
          <div
            className="flex h-7 w-4 shrink-0 items-center justify-center rounded cursor-pointer text-muted-foreground/50 hover:bg-muted-foreground/10 hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          >
            {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </div>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        {/* Avatar ↔ checkbox */}
        <div
          className="relative shrink-0 cursor-pointer"
          style={{ width: 28, height: 28 }}
          onClick={(e) => { if (!canSelect) return; e.stopPropagation(); onToggleCheck(); }}
        >
          {/* Avatar */}
          <div className={cn(
            "absolute inset-0 transition-opacity duration-100",
            isSelecting || isChecked ? "opacity-0" : canSelect ? "group-hover:opacity-0" : "",
          )}>
            {item.createdBy ? (
              <ActorAvatar actorType="member" actorId={item.createdBy} size={28} />
            ) : (
              <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                <FileText className={cn("size-3.5", isSelected ? "text-primary" : "text-muted-foreground")} />
              </div>
            )}
          </div>
          {/* Checkbox */}
          {canSelect && (
            <div className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-100",
              isSelecting || isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}>
              <div className={cn(
                "size-5 rounded border-2 flex items-center justify-center transition-colors",
                isChecked ? "bg-primary border-primary" : "border-muted-foreground/40 bg-background",
              )}>
                {isChecked && <Check className="size-3 text-white stroke-[3]" />}
              </div>
            </div>
          )}
        </div>

        {/* Two-line content */}
        <div className="min-w-0 flex-1">
          {/* Line 1: title + badges */}
          <div className="flex items-center justify-between gap-1">
            <span className={cn(
              "truncate text-sm leading-snug",
              item.isPending ? "italic text-muted-foreground/50" : "",
              isSelected && !isSelecting ? "font-medium text-foreground" : "text-foreground",
            )}>
              {item.title || "Untitled"}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {item.hasChildren && !isSelecting && (
                <span className="text-xs text-muted-foreground/50 tabular-nums">{item.childCount}</span>
              )}
              {isSelected && isCollaborating && !isSelecting && (
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" title="Multiple editors active" />
              )}
              {!isSelecting && !item.isPending && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="hidden group-hover:flex h-5 w-5 text-muted-foreground hover:text-primary shrink-0"
                  onClick={(e) => { e.stopPropagation(); onCreateChild(); }}
                >
                  <Plus className="size-3" />
                </Button>
              )}
            </div>
          </div>
          {/* Line 2: times */}
          {!item.isPending && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground/60">
              {item.updatedAt && item.updatedAt !== item.createdAt ? (
                <span>edited {timeAgo(item.updatedAt)}</span>
              ) : (
                <span>{timeAgo(item.createdAt)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* After-drop indicator */}
      {dropIndicator?.position === "after" && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20 h-0.5 bg-primary rounded-full" />
      )}
    </div>
  );
}
