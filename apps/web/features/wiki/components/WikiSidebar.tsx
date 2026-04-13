"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Plus, Search, ChevronRight, ChevronDown,
  Loader2, Trash2, Copy, X, Check, GripVertical, FileText, AlignLeft,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@multica/ui/components/ui/alert-dialog";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, pointerWithin, closestCenter,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
  type CollisionDetection,
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
  updated_by?: string;
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
  updatedBy?: string;
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
  collaboratingId?: string | null;
  onDeleteMultiple?: (ids: string[]) => void;
  onDuplicateMultiple?: (ids: string[]) => void;
  onMove?: (moves: { id: string; parentId: string | null; sortOrder: number }[]) => void;
}

/** Strip HTML tags and collapse whitespace — used for content search. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract a snippet around the first occurrence of `query` in `text`.
 * Returns at most `radius` characters on each side of the match.
 */
function getSnippet(text: string, query: string, radius = 80): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/**
 * Wrap every occurrence of `query` in `text` with a highlight span.
 * Returns an array of strings/elements so React can render it.
 */
function highlightText(text: string, query: string): ReactNode {
  if (!query) return text;
  const lq = query.toLowerCase();
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining) {
    const idx = remaining.toLowerCase().indexOf(lq);
    if (idx < 0) { parts.push(remaining); break; }
    if (idx > 0) parts.push(remaining.slice(0, idx));
    parts.push(
      <mark key={key++} className="bg-yellow-200 dark:bg-yellow-900/60 text-inherit rounded-sm not-italic">
        {remaining.slice(idx, idx + query.length)}
      </mark>
    );
    remaining = remaining.slice(idx + query.length);
  }
  return <>{parts}</>;
}

/** Recursively search all nodes for title / content matches. */
interface SearchResult {
  node: WikiNode;
  titleMatch: boolean;
  snippet: string | null; // highlighted text around content match
}

function searchNodes(items: WikiNode[], query: string): SearchResult[] {
  const lq = query.toLowerCase();
  const results: SearchResult[] = [];
  const visit = (nodes: WikiNode[]) => {
    for (const node of nodes) {
      const titleMatch = node.title.toLowerCase().includes(lq);
      const plainContent = stripHtml(node.content || "");
      const contentMatch = plainContent.toLowerCase().includes(lq);
      if (titleMatch || contentMatch) {
        results.push({
          node,
          titleMatch,
          snippet: contentMatch ? getSnippet(plainContent, query) : null,
        });
      }
      if (node.children) visit(node.children);
    }
  };
  visit(items);
  // Title matches first, then content-only matches
  results.sort((a, b) => {
    if (a.titleMatch && !b.titleMatch) return -1;
    if (!a.titleMatch && b.titleMatch) return 1;
    return 0;
  });
  return results;
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
      updatedBy: item.updated_by,
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
  nodes, isLoading, onCreateNew, onSelect, selectedId, collaboratingId,
  onDeleteMultiple, onDuplicateMultiple, onMove,
}: WikiSidebarProps) {
  const { searchQuery, setSearchQuery, expandedNodes, toggleNode, setExpandedNodes } = useWikiStore();
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const isSelecting = selectMode || multiSelected.size > 0;
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

  // pointerWithin: uses actual pointer position — ensures "over" is the item
  // the pointer is physically inside, not the nearest-center item.
  // This makes the before/child/after zone detection reliable.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : closestCenter(args);
  }, []);

  const toggleMultiSelect = useCallback((id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const clearSelection = () => { setMultiSelected(new Set()); setSelectMode(false); };

  const handleDeleteMultiple = () => {
    if (multiSelected.size === 0) return;
    setDeleteConfirm([...multiSelected]);
  };
  const handleDuplicateMultiple = () => { onDuplicateMultiple?.([...multiSelected]); clearSelection(); };

  // Full-text search results (title + content) — used when a query is active
  const searchResults = useMemo(
    () => (searchQuery.trim() ? searchNodes(nodes, searchQuery) : []),
    [nodes, searchQuery],
  );
  const isSearching = searchQuery.trim().length > 0;

  // Scroll selected item into view when selectedId changes (e.g. navigating via child page links)
  useEffect(() => {
    if (!selectedId || isSearching) return;
    const list = treeRef.current;
    if (!list) return;
    // rAF ensures the tree has rendered the item (after expansion) before measuring
    const rafId = requestAnimationFrame(() => {
      const el = list.querySelector(`[data-wiki-id="${selectedId}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedId, isSearching]);

  const flatItems = useMemo(
    () => flattenVisible(nodes, expandedNodes),
    [nodes, expandedNodes],
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
            placeholder="Search title and content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-7 text-sm bg-muted border-none focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Document tree / search results */}
      <div ref={treeRef} className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 opacity-40">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : isSearching ? (
          // ── Full-text search results (flat list) ──────────────────────────
          <div className="px-2 space-y-0.5">
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Search className="h-6 w-6 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
              </div>
            ) : (
              <>
                <p className="px-2 pb-1 text-[10px] text-muted-foreground/60 tabular-nums">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                </p>
                {searchResults.map(({ node, titleMatch, snippet }) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => { onSelect(node); setSearchQuery(""); }}
                    className={cn(
                      "w-full text-left rounded-md px-2 py-2 transition-colors group",
                      selectedId === node.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent text-foreground",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {snippet && !titleMatch ? (
                        <AlignLeft className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight">
                          {highlightText(node.title || "Untitled", searchQuery)}
                        </p>
                        {snippet && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {highlightText(snippet, searchQuery)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          // ── Normal DnD tree ───────────────────────────────────────────────
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
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
                  isCollaborating={collaboratingId === item.id}
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

      {/* Bottom bar — always visible: Select button or selection actions */}
      <div className="shrink-0 border-t px-3 py-1.5 flex items-center gap-1.5 bg-muted/20">
        {isSelecting ? (
          <>
            <span className="text-xs text-muted-foreground flex-1">{multiSelected.size} selected</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleDuplicateMultiple} title="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteMultiple} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={clearSelection} title="Cancel">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
            onClick={() => setSelectMode(true)}
          >
            <Check className="h-3 w-3 mr-1" />
            Select
          </Button>
        )}
      </div>

      {/* Delete multiple confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteConfirm?.length === 1 ? "this document" : `${deleteConfirm?.length} documents`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.length === 1
                ? "This action cannot be undone. The document and all its history will be permanently deleted."
                : `This action cannot be undone. ${deleteConfirm?.length} documents and all their history will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const ids = deleteConfirm;
                setDeleteConfirm(null);
                clearSelection();
                if (ids) onDeleteMultiple?.(ids);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      data-wiki-id={item.id}
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
          "group relative flex w-full cursor-pointer items-center gap-2 py-2.5 pr-2 transition-colors select-none",
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
          <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-primary/70 z-10">
            nest inside ↩
          </span>
        )}

        {/* Avatar ↔ checkbox */}
        <div
          className="relative shrink-0"
          style={{ width: 28, height: 28 }}
          onClick={(e) => { if (!isSelecting || !canSelect) return; e.stopPropagation(); onToggleCheck(); }}
        >
          {/* Avatar — always visible outside select mode */}
          <div className={cn(
            "absolute inset-0 transition-opacity duration-100",
            isSelecting ? "opacity-0" : "",
          )}>
            {item.createdBy ? (
              <ActorAvatar actorType="member" actorId={item.createdBy} size={28} />
            ) : (
              <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                <FileText className={cn("size-3.5", isSelected ? "text-primary" : "text-muted-foreground")} />
              </div>
            )}
            {isCollaborating && !isSelecting && (
              <div
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500"
                title="Multiple editors active"
              />
            )}
          </div>
          {/* Checkbox — only visible in select mode */}
          {canSelect && (
            <div className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-100",
              isSelecting ? "opacity-100" : "opacity-0",
            )}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => {}}
                className="cursor-pointer accent-primary size-4 pointer-events-none"
              />
            </div>
          )}
        </div>

        {/* Two-line content */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {/* Line 1: title */}
          <div className="flex items-center gap-1">
            <span className={cn(
              "truncate text-sm leading-snug",
              item.isPending ? "italic text-muted-foreground/50" : "",
              isSelected && !isSelecting ? "font-medium text-foreground" : "text-foreground",
            )}>
              {item.title || "Untitled"}
            </span>
          </div>
          {/* Line 2: last editor avatar + relative time */}
          {!item.isPending && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60">
              {(item.updatedBy || item.createdBy) && (
                <ActorAvatar
                  actorType="member"
                  actorId={(item.updatedBy || item.createdBy)!}
                  size={14}
                />
              )}
              {item.updatedAt && item.updatedAt !== item.createdAt ? (
                <span>{timeAgo(item.updatedAt)}</span>
              ) : (
                <span>{timeAgo(item.createdAt)}</span>
              )}
            </div>
          )}
        </div>

        {/* Right-side actions: add child + expand + drag handle — all vertically aligned */}
        {!item.isPending && (
          <div className="shrink-0 flex items-center gap-0.5">
            {!isSelecting && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="hidden group-hover:flex h-5 w-5 text-muted-foreground hover:text-primary"
                  onClick={(e) => { e.stopPropagation(); onCreateChild(); }}
                >
                  <Plus className="size-3" />
                </Button>
                {item.hasChildren ? (
                  <button
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted-foreground/10 hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                  >
                    {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  </button>
                ) : (
                  <div className="h-5 w-5 shrink-0" />
                )}
              </>
            )}
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center opacity-0 group-hover:opacity-30 hover:!opacity-70 cursor-grab active:cursor-grabbing text-muted-foreground"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-3.5" />
            </div>
          </div>
        )}
      </div>

      {/* After-drop indicator */}
      {dropIndicator?.position === "after" && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20 h-0.5 bg-primary rounded-full" />
      )}
    </div>
  );
}
