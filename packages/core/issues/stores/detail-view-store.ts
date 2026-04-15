import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

interface IssueDetailViewState {
  widthIndex: number;
  isFullWidth: boolean;
  setWidthIndex: (index: number) => void;
  setIsFullWidth: (isFullWidth: boolean) => void;
}

export const useIssueDetailViewStore = create<IssueDetailViewState>()(
  persist(
    (set) => ({
      widthIndex: 0,
      isFullWidth: false,
      setWidthIndex: (index) => set({ widthIndex: index }),
      setIsFullWidth: (isFullWidth) => set({ isFullWidth }),
    }),
    {
      name: "multica_issue_detail_view",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
      partialize: (state) => ({
        widthIndex: state.widthIndex,
        isFullWidth: state.isFullWidth,
      }),
    },
  ),
);

registerForWorkspaceRehydration(() => useIssueDetailViewStore.persist.rehydrate());
