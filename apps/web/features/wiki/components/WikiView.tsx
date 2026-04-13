"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { Library, Plus, Loader2, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from "@multica/ui/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@multica/ui/components/ui/dialog";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@multica/core/api";
import { useAuthStore } from "@multica/core/auth";
import { useWikiStore } from "../store";
import { cn } from "@multica/ui/lib/utils";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

import { WikiSidebar } from "./WikiSidebar";
import { WikiPropertySidebar } from "./WikiPropertySidebar";

// Dynamic import to avoid SSR hydration mismatch from collaboration state
const WikiEditor = lazy(() => import("./WikiEditor").then(m => ({ default: m.WikiEditor })));

interface WikiNode {
  id: string;
  title: string;
  content: string;
  parent_id?: string | null;
  sort_order?: number;
  children?: WikiNode[];
}

/** Deterministic cursor color from userId hash — same user always gets the same color. */
function userIdToColor(userId: string | undefined): string {
  if (!userId) return "#3b82f6";
  const palette = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#06b6d4", "#8b5cf6", "#ec4899", "#10b981",
  ];
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(h) % palette.length]!;
}

/** Returns the ancestor chain [root, …, direct parent] for a given wiki id. */
function getAncestors(items: any[], id: string): { id: string; title: string }[] {
  const map = new Map(items.map(i => [i.id, i]));
  const chain: { id: string; title: string }[] = [];
  let current = map.get(id);
  while (current?.parent_id && map.has(current.parent_id)) {
    current = map.get(current.parent_id);
    chain.unshift({ id: current.id, title: current.title });
  }
  return chain;
}

function buildTree(items: any[]): WikiNode[] {
  if (!items || !Array.isArray(items)) return [];
  const map = new Map<string, WikiNode>();
  const roots: WikiNode[] = [];
  items.forEach(item => map.set(item.id, { ...item, children: [] }));
  items.forEach(item => {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children?.push(node);
    } else {
      roots.push(node);
    }
  });
  // Sort each level by sort_order ascending
  const sortLevel = (nodes: WikiNode[]) => {
    nodes.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    nodes.forEach(n => { if (n.children?.length) sortLevel(n.children); });
  };
  sortLevel(roots);
  return roots;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Conflict modal state
interface ConflictState {
  open: boolean;
  serverVersion: number;
}

export function WikiView() {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  // Stable reference — prevents awareness useEffect from re-running on every keystroke
  const collabUser = useMemo(
    () => user ? { name: user.name || "User", color: userIdToColor(user.id), id: user.id } : undefined,
    [user],
  );
  const {
    selectedId, setSelectedId, setExpandedNodes, expandedNodes,
    isHistoryOpen, setIsHistoryOpen, viewingVersionId, setViewingVersionId
  } = useWikiStore();

  // Collaboration state
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [coEditorCount, setCoEditorCount] = useState(0); // number of OTHER users currently editing
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "multica_wiki_layout" });

  // Editor state
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentContent, setCurrentContent] = useState("");
  const [parentSelection, setParentSelection] = useState<string | null>(null);
  const editorRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Optimistic locking: the server version this client last saw
  const currentVersionRef = useRef<number>(1);

  // Save status indicator
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Conflict modal
  const [conflict, setConflict] = useState<ConflictState>({ open: false, serverVersion: 0 });

  // Autosave: triggers 10 seconds after the last change
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Last title+content successfully saved to the server (avoids unnecessary re-saves)
  const lastSavedContentRef = useRef<{ title: string; content: string } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Connect/disconnect collaboration provider whenever the selected doc changes
  useEffect(() => {
    // Always clear state first so ContentEditor sees ydoc=null and remounts cleanly.
    // Without this, navigating to "new" leaves stale (destroyed) ydoc in state,
    // causing the ContentEditor key to not change and the editor to not remount.
    setYdoc(null);
    setProvider(null);
    setCoEditorCount(0);

    // Clean up previous provider before connecting to a new one.
    // destroy() sets local awareness state to null first, so other clients
    // receive an explicit removal event rather than waiting for a TCP timeout.
    if (providerRef.current) {
      providerRef.current.awareness?.setLocalState(null);
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }

    if (selectedId && selectedId !== "new") {
      try {
        const newYdoc = new Y.Doc();
        const newProvider = new HocuspocusProvider({
          url: process.env.NEXT_PUBLIC_COLLAB_URL || "ws://localhost:8081",
          name: `wiki-${selectedId}`,
          document: newYdoc,
          token: user?.id,
          parameters: {
            userId: user?.id,
            userName: user?.name || "Collaborator",
            userColor: "#3b82f6"
          }
        } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        newProvider.on("error", (err: Error) => {
          console.error("Collaboration connection error:", err);
          toast.error("Collaboration connection failed");
        });

        // Count other users from awareness — green dot only when 2+ people editing.
        // Debounced so rapid cursor-move events don't cause the dot to flicker.
        const awareness = newProvider.awareness;
        let coEditorTimer: ReturnType<typeof setTimeout> | undefined;
        const updateCoEditorCount = () => {
          clearTimeout(coEditorTimer);
          coEditorTimer = setTimeout(() => {
            if (!awareness) { setCoEditorCount(0); return; }
            const states = awareness.getStates();
            const localId = awareness.clientID;
            let count = 0;
            states.forEach((_: any, id: number) => { if (id !== localId) count++; }); // eslint-disable-line @typescript-eslint/no-explicit-any
            setCoEditorCount(count);
          }, 500);
        };

        newProvider.on("connect", updateCoEditorCount);
        newProvider.on("disconnect", () => { clearTimeout(coEditorTimer); setCoEditorCount(0); });
        if (awareness) awareness.on("change", updateCoEditorCount);

        updateCoEditorCount();

        ydocRef.current = newYdoc;
        providerRef.current = newProvider;
        setYdoc(newYdoc);
        setProvider(newProvider);
      } catch (err) {
        console.error("Failed to initialize collaboration:", err);
      }
    }
  }, [selectedId, user]);

  // Fetch wiki list
  const { data: rawWikis = [], isLoading } = useQuery({
    queryKey: ["wikis"],
    queryFn: () => api.listWikis(),
    enabled: mounted,
  });

  const wikiTree = useMemo(() => buildTree(rawWikis), [rawWikis]);

  // Sync optimistic lock version when the selected wiki or wiki list changes.
  // Also initialises currentTitle/currentContent on first load so that a page-reload
  // with a persisted selectedId (Zustand) still populates the editor correctly.
  useEffect(() => {
    if (!selectedId || selectedId === "new") {
      currentVersionRef.current = 1;
      lastSavedContentRef.current = null;
      return;
    }
    const wiki = (rawWikis as any[]).find((w: any) => w.id === selectedId); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (wiki) {
      currentVersionRef.current = wiki.version ?? 1;
      if (!lastSavedContentRef.current) {
        lastSavedContentRef.current = { title: wiki.title, content: wiki.content ?? "" };
        // Populate editor state when arriving via persisted selectedId (not handleSelect).
        // Functional updates preserve any in-progress edits the user already made.
        setCurrentTitle((prev) => prev || wiki.title);
        setCurrentContent((prev) => prev || (wiki.content ?? ""));
      }
    }
  }, [selectedId, rawWikis]);

  // Fetch version history (used for diff view)
  const historyQuery = useQuery({
    queryKey: ["wiki-history", selectedId],
    queryFn: () => api.getWikiHistory(selectedId!),
    enabled: !!selectedId && isHistoryOpen,
  });

  const selectedVersion = useMemo(() => {
    if (!viewingVersionId) return null;
    return historyQuery.data?.find((v: any) => v.id === viewingVersionId);
  }, [viewingVersionId, historyQuery.data]);

  // The version immediately before selectedVersion (lower version_number)
  const prevVersion = useMemo(() => {
    if (!selectedVersion || !historyQuery.data) return null;
    // History sorted newest-first; find the next entry (lower version_number)
    const sorted = [...historyQuery.data].sort((a: any, b: any) => b.version_number - a.version_number);
    const idx = sorted.findIndex((v: any) => v.id === selectedVersion.id);
    return idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1] : null;
  }, [selectedVersion, historyQuery.data]);

  // Save mutation — sends base_version for optimistic locking; shows conflict dialog on 409
  const saveMutation = useMutation({
    mutationFn: (data: {
      id?: string;
      title: string;
      content: string;
      binary_state?: string | null;
      parent_id?: string | null;
      force?: boolean; // when true, saves without base_version (force overwrite)
    }) => {
      const payload: Parameters<typeof api.updateWiki>[1] = {
        title: data.title,
        content: data.content,
        binary_state: data.binary_state,
        parent_id: data.parent_id === null ? undefined : data.parent_id,
      };
      if (data.id && data.id !== "new") {
        if (!data.force) {
          payload.base_version = currentVersionRef.current;
        }
        return api.updateWiki(data.id, payload);
      }
      return api.createWiki({ title: data.title, content: data.content, parent_id: payload.parent_id });
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: (result, variables) => {
      if (result && "version" in result) {
        currentVersionRef.current = result.version;
      }
      lastSavedContentRef.current = { title: variables.title, content: variables.content };
      setSaveStatus("saved");
      // Return to idle after 3 seconds
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      queryClient.invalidateQueries({ queryKey: ["wikis"] });
      queryClient.invalidateQueries({ queryKey: ["wiki-history", selectedId] });
      if (result && "id" in result) setSelectedId((result as any).id);
      setParentSelection(null);
    },
    onError: (err: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (err?.status === 409) {
        // Conflict — handled via dialog, no toast here
        setConflict({ open: true, serverVersion: err?.current_version ?? 0 });
        setSaveStatus("error");
      } else {
        toast.error("Failed to save.");
        setSaveStatus("error");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWiki(id),
    onSuccess: () => {
      toast.success("Document deleted.");
      queryClient.invalidateQueries({ queryKey: ["wikis"] });
      setSelectedId(null);
    },
    onError: () => toast.error("Failed to delete.")
  });

  // Autosave: fires 10 seconds after the last title or content change
  useEffect(() => {
    if (!selectedId || selectedId === "new" || !mounted) return;
    const last = lastSavedContentRef.current;
    if (last && last.title === currentTitle && last.content === currentContent) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (saveMutation.isPending) return;
      const binaryState = editorRef.current?.getBinaryState() ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentParentId = (rawWikis as any[]).find((w: any) => w.id === selectedId)?.parent_id ?? null;
      saveMutation.mutate(
        { id: selectedId, title: currentTitle, content: currentContent, binary_state: binaryState, parent_id: currentParentId },
        { onSuccess: () => toast.success("Auto-saved.") },
      );
    }, 10_000);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [currentTitle, currentContent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (node: WikiNode) => {
    clearTimeout(autosaveTimerRef.current);
    lastSavedContentRef.current = null;
    setSelectedId(node.id);
    setViewingVersionId(null);
    setParentSelection(null);
    setCurrentTitle(node.title);
    setCurrentContent(node.content || "");
    setSaveStatus("idle");
  };

  const handleCreateNew = (parentId: string | null = null) => {
    setSelectedId("new");
    setViewingVersionId(null);
    setParentSelection(parentId);
    setCurrentTitle("");
    setCurrentContent("");
    if (parentId) {
      const next = new Set(expandedNodes);
      next.add(parentId);
      setExpandedNodes(next);
    }
  };

  const handleDeleteMultiple = useCallback((ids: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Promise.all(ids.map((id) => (api as any).deleteWiki(id)))
      .then(() => {
        toast.success(`Deleted ${ids.length} document${ids.length > 1 ? "s" : ""}.`);
        queryClient.invalidateQueries({ queryKey: ["wikis"] });
        if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      })
      .catch(() => toast.error("Some deletions failed."));
  }, [selectedId, queryClient]);

  const handleMoveWiki = useCallback((moves: { id: string; parentId: string | null; sortOrder: number }[]) => {
    Promise.all(moves.map(({ id, parentId, sortOrder }) =>
      api.moveWiki(id, { parent_id: parentId, sort_order: sortOrder })
    )).then(() => {
      queryClient.invalidateQueries({ queryKey: ["wikis"] });
    }).catch(() => toast.error("Failed to move document."));
  }, [queryClient]);

  const handleDuplicateMultiple = useCallback((ids: string[]) => {
    const wikis = rawWikis as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    Promise.all(
      ids.map((id) => {
        const wiki = wikis.find((w: any) => w.id === id); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!wiki) return Promise.resolve();
        return api.createWiki({ title: `Copy of ${wiki.title}`, content: wiki.content || "" });
      }),
    )
      .then(() => {
        toast.success(`Duplicated ${ids.length} document${ids.length > 1 ? "s" : ""}.`);
        queryClient.invalidateQueries({ queryKey: ["wikis"] });
      })
      .catch(() => toast.error("Some duplications failed."));
  }, [rawWikis, queryClient]);

  const handleSave = useCallback((binaryState?: string | null) => {
    if (!currentTitle.trim()) { toast.error("Set a title first."); return; }
    clearTimeout(autosaveTimerRef.current); // Reset autosave timer on manual save
    // For existing docs, always read parent_id from the server data (not parentSelection,
    // which is only set for new documents and is null for existing ones).
    const parentId = selectedId && selectedId !== "new"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((rawWikis as any[]).find((w: any) => w.id === selectedId)?.parent_id ?? null)
      : parentSelection;
    saveMutation.mutate(
      {
        id: selectedId || undefined,
        title: currentTitle,
        content: currentContent,
        binary_state: binaryState,
        parent_id: parentId,
      },
      { onSuccess: () => toast.success("Saved.") },
    );
  }, [currentTitle, currentContent, selectedId, parentSelection, rawWikis, saveMutation]);

  const handleUploadFile = async (file: File) => {
    try {
      const att = await api.uploadFile(file);
      return { id: att.id, filename: att.filename, link: att.url };
    } catch {
      toast.error("File upload failed.");
      return null;
    }
  };

  const handleDelete = () => {
    if (selectedId && selectedId !== "new") deleteMutation.mutate(selectedId);
  };

  const handleRestore = useCallback((version: any) => {
    setCurrentTitle(version.title);
    setCurrentContent(version.content);

    // Apply Yjs binary_state immediately (Y.applyUpdate → yText.observe → editor auto-updates)
    if (version.binary_state) {
      editorRef.current?.restoreBinaryState(version.binary_state);
    }

    setViewingVersionId(null);
    setIsHistoryOpen(false);

    // Save restored content to server as a new version (restore = new snapshot)
    if (selectedId && selectedId !== "new") {
      const currentParentId = (rawWikis as any[]).find((w: any) => w.id === selectedId)?.parent_id ?? null;
      saveMutation.mutate(
        {
          id: selectedId,
          title: version.title,
          content: version.content,
          binary_state: version.binary_state ?? null,
          parent_id: currentParentId,
        },
        {
          onSuccess: () => toast.success(`Restored to version ${version.version_number}`),
          onError: () => toast.error("Failed to save restored version."),
        },
      );
    } else {
      toast.success(`Restored to version ${version.version_number}`);
    }
  }, [selectedId, rawWikis, saveMutation]);

  // Conflict modal handlers
  const handleConflictForce = useCallback(() => {
    // Force save: overwrite with local content without base_version
    const binaryState = editorRef.current?.getBinaryState() ?? null;
    const currentParentId = (rawWikis as any[]).find((w: any) => w.id === selectedId)?.parent_id ?? null;
    setConflict({ open: false, serverVersion: 0 });
    saveMutation.mutate(
      {
        id: selectedId || undefined,
        title: currentTitle,
        content: currentContent,
        binary_state: binaryState,
        parent_id: currentParentId,
        force: true,
      },
      { onSuccess: () => toast.success("Force saved.") },
    );
  }, [selectedId, currentTitle, currentContent, rawWikis, saveMutation]);

  const handleConflictDiscard = useCallback(() => {
    // Reload latest: discard local changes and invalidate cache
    setConflict({ open: false, serverVersion: 0 });
    lastSavedContentRef.current = null;
    queryClient.invalidateQueries({ queryKey: ["wikis"] });
    toast.info("Reloaded to latest version.");
  }, [queryClient]);

  // 3. Render logic
  const renderMainContent = () => {
    if (!selectedId) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            <Library className="h-8 w-8 text-primary/40" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">No document selected</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              Select a document from the list to view and edit it.
            </p>
          </div>
          <Button
            onClick={() => handleCreateNew(null)}
            size="sm"
            className="mt-2"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Button>
        </div>
      );
    }

    if (viewingVersionId && selectedVersion) {
      return (
        <WikiDiffView
          prevTitle={prevVersion?.title ?? ""}
          prevContent={prevVersion?.content ?? ""}
          prevVersionNumber={prevVersion?.version_number ?? null}
          versionTitle={selectedVersion.title}
          versionContent={selectedVersion.content}
          versionNumber={selectedVersion.version_number}
          onClose={() => setViewingVersionId(null)}
          onRestore={() => handleRestore(selectedVersion)}
        />
      );
    }

    return (
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
          </div>
        }
      >
        <WikiEditor
          ref={editorRef}
          id={selectedId}
          title={currentTitle}
          content={currentContent}
          ancestors={
            selectedId && selectedId !== "new"
              ? getAncestors(rawWikis as any[], selectedId)
              : parentSelection
                ? getAncestors(rawWikis as any[], parentSelection).concat(
                    (() => { const p = (rawWikis as any[]).find((w: any) => w.id === parentSelection); return p ? [{ id: p.id, title: p.title }] : []; })()
                  )
                : []
          }
          childPages={
            selectedId && selectedId !== "new"
              ? (rawWikis as any[])
                  .filter((w: any) => w.parent_id === selectedId)
                  .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((w: any) => ({ id: w.id, title: w.title }))
              : []
          }
          onNavigateTo={(id) => {
            const wiki = (rawWikis as any[]).find((w: any) => w.id === id);
            if (wiki) handleSelect(wiki);
          }}
          onCreateChild={selectedId && selectedId !== "new" ? () => handleCreateNew(selectedId) : undefined}
          onUpdateTitle={setCurrentTitle}
          onUpdateContent={setCurrentContent}
          onSave={handleSave}
          onUploadFile={handleUploadFile}
          onDelete={handleDelete}
          saveStatus={saveStatus}
          ydoc={ydoc}
          provider={provider}
          user={collabUser}
        />
      </Suspense>
    );
  };

  if (!mounted) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/20" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-background">
      {/* Save conflict modal */}
      {conflict.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Save Conflict</h2>
            <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
              Someone else saved this document before you.
              You can overwrite with your changes or reload the latest version to continue editing.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleConflictForce}
                className="w-full text-xs"
              >
                Overwrite with my changes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleConflictDiscard}
                className="w-full text-xs"
              >
                Reload latest (discard my changes)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConflict({ open: false, serverVersion: 0 })}
                className="w-full text-xs text-muted-foreground"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {/* Sidebar */}
        <ResizablePanel
          id="wiki-sidebar"
          defaultSize={280}
          minSize={200}
          maxSize={480}
          groupResizeBehavior="preserve-pixel-size"
          className="border-r border-border"
        >
          <WikiSidebar
            nodes={wikiTree}
            isLoading={isLoading}
            onCreateNew={handleCreateNew}
            onSelect={handleSelect}
            selectedId={selectedId}
            isCollaborating={coEditorCount > 0}
            onDeleteMultiple={handleDeleteMultiple}
            onDuplicateMultiple={handleDuplicateMultiple}
            onMove={handleMoveWiki}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Main editor */}
        <ResizablePanel id="wiki-editor" minSize="40%">
          <div className="flex h-full w-full overflow-hidden">
            <div className="flex-1 h-full min-w-0 overflow-hidden">
              {renderMainContent()}
            </div>

            {/* Properties + History panel */}
            {selectedId && selectedId !== "new" && (() => {
              const w = (rawWikis as any[]).find((x: any) => x.id === selectedId);
              return (
                <WikiPropertySidebar
                  wikiId={selectedId}
                  currentContent={currentContent}
                  createdBy={w?.created_by}
                  updatedBy={w?.updated_by}
                  createdAt={w?.created_at}
                  updatedAt={w?.updated_at}
                  onRestore={handleRestore}
                />
              );
            })()}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/**
 * Character-level diff algorithm (simplified Myers diff).
 * Returns an array of { type, text } segments comparing two strings.
 */
function charDiff(oldStr: string, newStr: string): { type: 'same' | 'removed' | 'added'; text: string }[] {
  // LCS (Longest Common Subsequence) based character-level comparison
  const oldLen = oldStr.length;
  const newLen = newStr.length;

  // Performance guard: fall back to line-level diff for very long strings
  if (oldLen + newLen > 20000) {
    return simpleFallback(oldStr, newStr);
  }

  // Build DP table (space-optimized rolling array)
  const prev = new Uint16Array(newLen + 1);
  const curr = new Uint16Array(newLen + 1);

  for (let i = 1; i <= oldLen; i++) {
    for (let j = 0; j <= newLen; j++) prev[j] = curr[j]!;
    for (let j = 1; j <= newLen; j++) {
      if (oldStr[i - 1] === newStr[j - 1]) {
        curr[j] = prev[j - 1]! + 1;
      } else {
        curr[j] = Math.max(curr[j - 1]!, prev[j]!);
      }
    }
  }

  // Full table required for backtracking — only for small inputs
  const dp: number[][] = Array.from({ length: oldLen + 1 }, () => new Array(newLen + 1).fill(0));
  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldStr[i - 1] === newStr[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to build diff result
  const result: { type: 'same' | 'removed' | 'added'; text: string }[] = [];
  let oi = oldLen, ni = newLen;

  const raw: { type: 'same' | 'removed' | 'added'; char: string }[] = [];
  while (oi > 0 || ni > 0) {
    if (oi > 0 && ni > 0 && oldStr[oi - 1] === newStr[ni - 1]) {
      raw.push({ type: 'same', char: oldStr[oi - 1]! });
      oi--; ni--;
    } else if (ni > 0 && (oi === 0 || dp[oi]![ni - 1]! >= dp[oi - 1]![ni]!)) {
      raw.push({ type: 'added', char: newStr[ni - 1]! });
      ni--;
    } else {
      raw.push({ type: 'removed', char: oldStr[oi - 1]! });
      oi--;
    }
  }
  raw.reverse();

  // Merge consecutive segments of the same type
  for (const item of raw) {
    const last = result[result.length - 1];
    if (last && last.type === item.type) {
      last.text += item.char;
    } else {
      result.push({ type: item.type, text: item.char });
    }
  }

  return result;
}

/** Fallback for large text: line-level diff */
function simpleFallback(oldStr: string, newStr: string): { type: 'same' | 'removed' | 'added'; text: string }[] {
  if (oldStr === newStr) return [{ type: 'same', text: oldStr }];
  const result: { type: 'same' | 'removed' | 'added'; text: string }[] = [];
  if (oldStr) result.push({ type: 'removed', text: oldStr });
  if (newStr) result.push({ type: 'added', text: newStr });
  return result;
}

/** Strip HTML tags and decode entities using the browser DOM. */
function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? el.innerText ?? "";
}

function WikiDiffView({ prevTitle, prevContent, prevVersionNumber, versionTitle, versionContent, versionNumber, onClose, onRestore }: any) {
  // Compare previous version (old) → this version (new)
  const oldText = htmlToPlainText(prevContent || "");
  const newText = htmlToPlainText(versionContent || "");
  const diffSegments = charDiff(oldText, newText);
  const titleChanged = prevTitle !== versionTitle;
  const isFirstVersion = prevVersionNumber === null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4 gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {isFirstVersion ? (
            <span>Initial version <span className="text-foreground/70 font-semibold">v{versionNumber}</span></span>
          ) : (
            <span>
              <span className="text-foreground/50">v{prevVersionNumber}</span>
              <span className="mx-1">→</span>
              <span className="text-foreground/70 font-semibold">v{versionNumber}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-3 text-xs">
            Close
          </Button>
          <Button variant="default" size="sm" onClick={onRestore} className="h-7 px-3 text-xs font-medium">
            <ArrowLeft className="mr-1.5 h-3 w-3" />
            Restore
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pt-8 pb-16">
        <div className="mx-auto max-w-2xl px-6">
          {/* Title */}
          <div className="mb-8">
            {titleChanged ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium mb-2">Title changed:</div>
                <div className="space-y-1.5">
                  <h1 className="text-lg font-bold text-destructive/60 line-through opacity-70">
                    {prevTitle || "Untitled"}
                  </h1>
                  <h1 className="text-2xl font-bold text-foreground bg-primary/10 px-2 py-1 rounded">
                    {versionTitle}
                  </h1>
                </div>
              </div>
            ) : (
              <h1 className="text-2xl font-bold text-foreground">
                {versionTitle}
              </h1>
            )}
          </div>

          {/* Content diff */}
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <div className="text-sm text-muted-foreground font-medium mb-4">Content changes:</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
              {diffSegments.map((seg, idx) => {
                if (seg.type === 'same') {
                  return <span key={idx}>{seg.text}</span>;
                }
                if (seg.type === 'removed') {
                  return (
                    <span
                      key={idx}
                      className="bg-destructive/20 text-destructive line-through rounded px-0.5"
                    >
                      {seg.text}
                    </span>
                  );
                }
                return (
                  <span
                    key={idx}
                    className="bg-green-500/20 text-green-700 dark:text-green-400 rounded px-0.5 font-medium"
                  >
                    {seg.text}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

