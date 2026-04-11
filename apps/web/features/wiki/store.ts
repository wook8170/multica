import { create } from "zustand";

interface WikiState {
  selectedId: string | null;
  searchQuery: string;
  expandedNodes: Set<string>;
  isHistoryOpen: boolean;
  viewingVersionId: string | null;
  isFullWidth: boolean;
  
  // Actions
  setSelectedId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setExpandedNodes: (nodes: Set<string>) => void;
  toggleNode: (id: string) => void;
  setIsHistoryOpen: (open: boolean) => void;
  setViewingVersionId: (id: string | null) => void;
  setIsFullWidth: (fullWith: boolean) => void;
  reset: () => void;
}

export const useWikiStore = create<WikiState>((set) => ({
  selectedId: null,
  searchQuery: "",
  expandedNodes: new Set<string>(),
  isHistoryOpen: false,
  viewingVersionId: null,
  isFullWidth: false,

  setSelectedId: (id) => set({ selectedId: id, viewingVersionId: null }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setExpandedNodes: (nodes) => set({ expandedNodes: nodes }),
  
  toggleNode: (id) => set((state) => {
    const next = new Set(state.expandedNodes);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { expandedNodes: next };
  }),

  setIsHistoryOpen: (open) => set({ isHistoryOpen: open }),
  setViewingVersionId: (id) => set({ viewingVersionId: id }),
  setIsFullWidth: (full) => set({ isFullWidth: full }),

  reset: () => set({
    selectedId: null,
    searchQuery: "",
    expandedNodes: new Set<string>(),
    isHistoryOpen: false,
    viewingVersionId: null,
    isFullWidth: false,
  }),
}));
