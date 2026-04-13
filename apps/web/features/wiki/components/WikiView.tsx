"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy, type ReactNode } from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { Library, Plus, Minus, Loader2, Clock, ArrowLeft, RotateCcw, X, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@multica/core/api";
import { useAuthStore } from "@multica/core/auth";
import { ReadonlyContent } from "@multica/views/editor";
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

export function WikiView({ initialSelectedId }: { initialSelectedId?: string | null } = {}) {
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
  const [collabConnected, setCollabConnected] = useState(false); // collab server reachable
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "multica_wiki_layout" });
  const propertySidebarRef = usePanelRef();

  // Sync isHistoryOpen → panel collapse/expand
  useEffect(() => {
    const panel = propertySidebarRef.current;
    if (!panel) return;
    if (isHistoryOpen) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [isHistoryOpen, propertySidebarRef]);

  // Editor state
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentContent, setCurrentContent] = useState("");
  const [parentSelection, setParentSelection] = useState<string | null>(null);
  const [restoreKey, setRestoreKey] = useState(0); // incremented on version restore to force editor remount
  const editorRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Confirmation dialogs
  const [restoreConfirm, setRestoreConfirm] = useState<{ open: boolean; version: any }>({ open: false, version: null });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [createConfirm, setCreateConfirm] = useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null });

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

  // Open a specific wiki when navigating from search (URL ?id= param)
  useEffect(() => {
    if (!initialSelectedId || initialSelectedId === selectedId) return;
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect/disconnect collaboration provider whenever the selected doc changes
  useEffect(() => {
    // Always clear state first so ContentEditor sees ydoc=null and remounts cleanly.
    // Without this, navigating to "new" leaves stale (destroyed) ydoc in state,
    // causing the ContentEditor key to not change and the editor to not remount.
    setYdoc(null);
    setProvider(null);
    setCoEditorCount(0);
    setCollabConnected(false);

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

        newProvider.on("error", (err: unknown) => {
          console.error("Collaboration connection error:", err);
          toast.error("Collaboration connection failed");
        });

        // Update connection status indicator once fully synced with the server.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newProvider.on("sync", (payload: any) => {
          const state = typeof payload === "object" ? payload?.state : payload;
          if (state && providerRef.current === newProvider) setCollabConnected(true);
        });
        newProvider.on("disconnect", () => { setCollabConnected(false); });

        // Track how many OTHER users are currently editing (for the sidebar presence dot).
        const awareness = newProvider.awareness;
        let coEditorTimer: ReturnType<typeof setTimeout> | undefined;
        const updateCoEditorCount = () => {
          clearTimeout(coEditorTimer);
          coEditorTimer = setTimeout(() => {
            if (!awareness) { setCoEditorCount(0); return; }
            const states = awareness.getStates();
            const localId = awareness.clientID;
            let count = 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            states.forEach((_: any, id: number) => { if (id !== localId) count++; });
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
      const isCollaborativeSave = coEditorCount > 0;
      const payload: Parameters<typeof api.updateWiki>[1] = {
        title: data.title,
        content: data.content,
        binary_state: data.binary_state,
        parent_id: data.parent_id === null ? undefined : data.parent_id,
      };
      if (data.id && data.id !== "new") {
        if (!data.force && !isCollaborativeSave) {
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
    onError: (err: any, variables) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (err?.status === 409) {
        if (coEditorCount > 0) {
          saveMutation.mutate({ ...variables, force: true });
          return;
        }
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

  // Autosave: fires 10 seconds after the last title or content change.
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
    setRestoreKey(0); // reset so forceDefault doesn't carry over to the new document

    // Expand all ancestors so the item is visible in the sidebar tree
    const ancestors = getAncestors(rawWikis as any[], node.id);
    if (ancestors.length > 0) {
      const next = new Set(expandedNodes);
      ancestors.forEach((a) => next.add(a.id));
      setExpandedNodes(next);
    }
  };

  const doCreateNew = (parentId: string | null = null) => {
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

  const handleCreateNew = (parentId: string | null = null) => {
    const last = lastSavedContentRef.current;
    const hasUnsaved = selectedId && selectedId !== "new" && last &&
      (last.title !== currentTitle || last.content !== currentContent);
    if (hasUnsaved) {
      setCreateConfirm({ open: true, parentId });
    } else {
      doCreateNew(parentId);
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
    if (selectedId && selectedId !== "new") setDeleteConfirm(true);
  };

  const doDelete = () => {
    if (selectedId && selectedId !== "new") deleteMutation.mutate(selectedId);
  };

  const doRestore = useCallback((version: any) => {
    setCurrentTitle(version.title);
    setCurrentContent(version.content);

    // Force ContentEditor to remount so preprocessMarkdown runs on the restored content.
    // This ensures file card attachments are properly rendered as download blocks.
    // Binary state restore is skipped — the Markdown content is the source of truth.
    setRestoreKey((k) => k + 1);

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

  const handleRestore = useCallback((version: any) => {
    setRestoreConfirm({ open: true, version });
  }, []);

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
          createdAt={selectedVersion.created_at}
          createdBy={selectedVersion.created_by}
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
          restoreKey={restoreKey}
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
          collabConnected={collabConnected}
          showRemoteCursors={!conflict.open && !restoreConfirm.open && !deleteConfirm && !createConfirm.open}
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

      {/* Restore version confirmation */}
      <AlertDialog open={restoreConfirm.open} onOpenChange={(open) => setRestoreConfirm((s) => ({ ...s, open }))}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreConfirm.version
                ? `Version ${restoreConfirm.version.version_number} will replace the current content. The current state will be saved as a new version first.`
                : "This version will replace the current content."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRestoreConfirm({ open: false, version: null })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const v = restoreConfirm.version;
                setRestoreConfirm({ open: false, version: null });
                if (v) doRestore(v);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete document confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The document and all its history will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { setDeleteConfirm(false); doDelete(); }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes — create new document confirmation */}
      <AlertDialog open={createConfirm.open} onOpenChange={(open) => setCreateConfirm((s) => ({ ...s, open }))}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the current document. Creating a new document will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCreateConfirm({ open: false, parentId: null })}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const parentId = createConfirm.parentId;
                setCreateConfirm({ open: false, parentId: null });
                doCreateNew(parentId);
              }}
            >
              Discard & create new
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            collaboratingId={coEditorCount > 0 ? selectedId : null}
            onDeleteMultiple={handleDeleteMultiple}
            onDuplicateMultiple={handleDuplicateMultiple}
            onMove={handleMoveWiki}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Main editor */}
        <ResizablePanel id="wiki-editor" minSize="30%">
          {renderMainContent()}
        </ResizablePanel>

        <ResizableHandle />

        {/* Properties sidebar */}
        <ResizablePanel
          id="wiki-property"
          defaultSize={260}
          minSize={200}
          maxSize={440}
          collapsible
          groupResizeBehavior="preserve-pixel-size"
          panelRef={propertySidebarRef}
          onResize={(size) => {
            const open = size.inPixels > 0;
            if (open !== isHistoryOpen) setIsHistoryOpen(open);
          }}
        >
          {selectedId && selectedId !== "new" && (() => {
            const w = (rawWikis as any[]).find((x: any) => x.id === selectedId);
            const childPages = (rawWikis as any[])
              .filter((x: any) => x.parent_id === selectedId)
              .map((x: any) => ({ id: x.id, title: x.title }));
            return (
              <WikiPropertySidebar
                wikiId={selectedId}
                currentContent={currentContent}
                createdBy={w?.created_by}
                updatedBy={w?.updated_by}
                createdAt={w?.created_at}
                updatedAt={w?.updated_at}
                childPages={childPages}
                onNavigateTo={(id) => {
                  const wiki = (rawWikis as any[]).find((x: any) => x.id === id);
                  if (wiki) handleSelect(wiki);
                }}
                onRestore={handleRestore}
              />
            );
          })()}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block-level diff helpers
// ---------------------------------------------------------------------------

/** Split markdown content into top-level blocks separated by blank lines. */
function splitIntoBlocks(content: string): string[] {
  return content.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}

/** True if a block is a standalone file attachment (fileCard div, CDN image, or CDN link). */
const ATTACHMENT_BLOCK_RE =
  /^(?:<div\b[^>]*data-type=["']fileCard["']|!\[.*?\]\(https?:\/\/|\[[^\]]+\]\(https?:\/\/)/i;

function isAttachmentBlock(block: string): boolean {
  return ATTACHMENT_BLOCK_RE.test(block.trim());
}

type BlockDiffSegment = {
  type: "same" | "added" | "removed";
  blocks: string[];
};

/** LCS-based block-level diff. Returns consecutive same-type blocks grouped. */
function diffBlocks(oldBlocks: string[], newBlocks: string[]): BlockDiffSegment[] {
  if (oldBlocks.length + newBlocks.length > 2000) {
    return [
      ...(oldBlocks.length ? [{ type: "removed" as const, blocks: oldBlocks }] : []),
      ...(newBlocks.length ? [{ type: "added" as const, blocks: newBlocks }] : []),
    ];
  }
  const m = oldBlocks.length;
  const n = newBlocks.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        oldBlocks[i - 1] === newBlocks[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const raw: { type: "same" | "added" | "removed"; block: string }[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldBlocks[i - 1] === newBlocks[j - 1]) {
      raw.unshift({ type: "same", block: newBlocks[j - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      raw.unshift({ type: "added", block: newBlocks[j - 1]! });
      j--;
    } else {
      raw.unshift({ type: "removed", block: oldBlocks[i - 1]! });
      i--;
    }
  }
  const segments: BlockDiffSegment[] = [];
  for (const item of raw) {
    const last = segments[segments.length - 1];
    if (last?.type === item.type) {
      last.blocks.push(item.block);
    } else {
      segments.push({ type: item.type, blocks: [item.block] });
    }
  }
  return segments;
}

// ---------------------------------------------------------------------------
// WikiDiffView
// ---------------------------------------------------------------------------

function WikiDiffView({
  prevTitle,
  prevContent,
  prevVersionNumber,
  versionTitle,
  versionContent,
  versionNumber,
  createdAt,
  onClose,
  onRestore,
}: any) {
  const isFirstVersion = prevVersionNumber === null;
  const titleChanged = prevTitle !== versionTitle;

  const segments = useMemo<BlockDiffSegment[]>(() => {
    if (isFirstVersion) {
      return [{ type: "same", blocks: splitIntoBlocks(versionContent || "") }];
    }
    return diffBlocks(
      splitIntoBlocks(prevContent || ""),
      splitIntoBlocks(versionContent || ""),
    );
  }, [isFirstVersion, prevContent, versionContent]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4 gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {isFirstVersion ? (
            <span>
              Initial version{" "}
              <span className="text-foreground/70 font-semibold">v{versionNumber}</span>
            </span>
          ) : (
            <span>
              <span className="text-foreground/50">v{prevVersionNumber}</span>
              <span className="mx-1">→</span>
              <span className="text-foreground/70 font-semibold">v{versionNumber}</span>
            </span>
          )}
          {createdAt && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>
                {new Date(createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                {new Date(createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            onClick={onRestore}
            title="Restore this version"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-muted transition-colors"
            onClick={onClose}
            title="Close diff view"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content — single view like read mode, changed blocks highlighted */}
      <div className="flex-1 overflow-y-auto pt-8 pb-16">
        <div className="mx-auto max-w-2xl px-6">
          {/* Title */}
          <div className="mb-6">
            {titleChanged ? (
              <div className="space-y-1.5">
                <h1 className="text-lg font-bold text-destructive/60 line-through opacity-70">
                  {prevTitle || "Untitled"}
                </h1>
                <h1 className="text-2xl font-bold text-foreground bg-green-500/10 px-2 py-1 rounded">
                  {versionTitle}
                </h1>
              </div>
            ) : (
              <h1 className="text-2xl font-bold text-foreground">{versionTitle}</h1>
            )}
          </div>

          {/* Diff content */}
          <div>
            {segments.map((segment, idx) => {
              if (segment.type === "same") {
                return (
                  <ReadonlyContent key={idx} content={segment.blocks.join("\n\n")} />
                );
              }

              const diffClass = segment.type === "added" ? "diff-added" : "diff-removed";
              const indicator = segment.type === "added" ? (
                <Plus className="absolute -left-5 top-1/2 z-10 -translate-y-1/2 size-3.5 text-green-500 pointer-events-none select-none" />
              ) : (
                <Minus className="absolute -left-5 top-1/2 z-10 -translate-y-1/2 size-3.5 text-destructive pointer-events-none select-none" />
              );

              // Render each block individually so every block gets its own indicator
              return segment.blocks.map((block, blockIdx) => {
                const blockKey = `${idx}-${blockIdx}`;

                if (isAttachmentBlock(block)) {
                  return (
                    <div key={blockKey} className="relative">
                      {indicator}
                      <ReadonlyContent content={block} className={diffClass} />
                    </div>
                  );
                }

                return (
                  <div
                    key={blockKey}
                    className={cn(
                      "relative",
                      segment.type === "added"
                        ? "bg-green-500/8"
                        : "bg-destructive/8 opacity-75",
                    )}
                  >
                    {indicator}
                    <ReadonlyContent content={block} />
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
