# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**142 library files** across 6 modules

## Server (89 files)

- `server/pkg/db/generated/models.go` — ActivityLog, Agent, AgentRuntime, AgentSkill, AgentTaskQueue, Attachment, …
- `server/pkg/db/generated/agent.sql.go` — ArchiveAgentParams, CompleteAgentTaskParams, CreateAgentParams, CreateAgentTaskParams, FailAgentTaskParams, FailStaleTasksParams, …
- `server/pkg/db/generated/issue.sql.go` — ChildIssueProgressRow, CountCreatedIssueAssigneesParams, CountCreatedIssueAssigneesRow, CountIssuesParams, CreateIssueParams, GetIssueByNumberParams, …
- `server/internal/daemon/execenv/execenv.go` — Prepare, Reuse, WriteGCMeta, ReadGCMeta, RepoContextForEnv, PrepareParams, …
- `server/pkg/db/generated/inbox.sql.go` — ArchiveAllInboxParams, ArchiveAllReadInboxParams, ArchiveCompletedInboxParams, ArchiveInboxByIssueParams, CountUnreadInboxParams, CreateInboxItemParams, …
- `server/pkg/protocol/messages.go` — Message, TaskDispatchPayload, TaskProgressPayload, TaskCompletedPayload, TaskMessagePayload, DaemonRegisterPayload, …
- `server/internal/cli/config.go` — CLIConfigPath, CLIConfigPathForProfile, ProfileDir, LoadCLIConfig, LoadCLIConfigForProfile, SaveCLIConfig, …
- `server/internal/daemon/client.go` — NewClient, Client, TaskMessageData, HeartbeatResponse, PendingPing, PendingUpdate, …
- `server/internal/daemon/types.go` — AgentEntry, Runtime, RepoData, Task, AgentData, SkillData, …
- `server/pkg/agent/agent.go` — New, DetectVersion, ExecOptions, Session, Message, TokenUsage, …
- `server/pkg/db/generated/chat.sql.go` — CreateChatMessageParams, CreateChatSessionParams, CreateChatTaskParams, GetChatSessionInWorkspaceParams, GetLastChatTaskSessionRow, ListAllChatSessionsByCreatorParams, …
- `server/pkg/db/generated/comment.sql.go` — CountCommentsParams, CreateCommentParams, GetCommentInWorkspaceParams, HasAgentCommentedSinceParams, ListCommentsParams, ListCommentsPaginatedParams, …
- `server/internal/handler/daemon.go` — DaemonRegisterRequest, DaemonHeartbeatRequest, TaskProgressRequest, TaskCompleteRequest, TaskUsagePayload, TaskFailRequest, …
- `server/internal/handler/skill.go` — SkillResponse, SkillFileResponse, SkillWithFilesResponse, CreateSkillRequest, CreateSkillFileRequest, UpdateSkillRequest, …
- `server/internal/handler/wiki.go` — WikiResponse, WikiVersionResponse, CreateWikiRequest, SaveWikiDraftRequest, WikiDraftResponse, SearchWikiResult, …
- `server/internal/util/pgx.go` — ParseUUID, UUIDToString, TextToPtr, PtrToText, StrToText, TimestampToString, …
- `server/pkg/db/generated/attachment.sql.go` — CreateAttachmentParams, DeleteAttachmentParams, GetAttachmentParams, LinkAttachmentsToCommentParams, LinkAttachmentsToIssueParams, ListAttachmentsByCommentParams, …
- `server/internal/handler/workspace.go` — WorkspaceResponse, MemberResponse, CreateWorkspaceRequest, UpdateWorkspaceRequest, MemberWithUserResponse, CreateMemberRequest, …
- `server/internal/middleware/workspace.go` — MemberFromContext, WorkspaceIDFromContext, SetMemberContext, RequireWorkspaceMember, RequireWorkspaceRole, RequireWorkspaceMemberFromURL, …
- `server/internal/realtime/hub.go` — SetAllowedOrigins, NewHub, HandleWebSocket, Client, Hub, MembershipChecker, …
- `server/pkg/db/generated/runtime.sql.go` — DeleteStaleOfflineRuntimesRow, FailTasksForOfflineRuntimesRow, GetAgentRuntimeForWorkspaceParams, ListAgentRuntimesByOwnerParams, MarkStaleRuntimesOfflineRow, MigrateAgentsToRuntimeParams, …
- `server/pkg/db/generated/skill.sql.go` — AddAgentSkillParams, CreateSkillParams, GetSkillInWorkspaceParams, ListAgentSkillsByWorkspaceRow, RemoveAgentSkillParams, UpdateSkillParams, …
- `server/internal/cli/update.go` — FetchLatestRelease, IsBrewInstall, GetBrewPrefix, UpdateViaBrew, UpdateViaDownload, GitHubRelease
- `server/internal/daemon/repocache/cache.go` — New, RepoInfo, CachedRepo, Cache, WorktreeParams, WorktreeResult
- `server/internal/handler/agent.go` — AgentResponse, RepoData, AgentTaskResponse, TaskAgentData, CreateAgentRequest, UpdateAgentRequest
- _…and 64 more files_

## Core (37 files)

- `packages/core/issues/mutations.ts` — useLoadMoreDoneIssues, useCreateIssue, useUpdateIssue, useDeleteIssue, useBatchUpdateIssues, useBatchDeleteIssues, …
- `packages/core/issues/stores/view-store.ts` — createIssueViewStore, registerViewStoreForWorkspaceSync, viewStoreSlice, viewStorePersistOptions, initFilterWorkspaceSync, CardProperties, …
- `packages/core/issues/queries.ts` — issueListOptions, myIssueListOptions, issueDetailOptions, childIssueProgressOptions, childIssuesOptions, issueTimelineOptions, …
- `packages/core/chat/store.ts` — createChatStore, ChatTimelineItem, ChatState, ChatStoreOptions, CHAT_MIN_W, CHAT_MIN_H, …
- `packages/core/inbox/mutations.ts` — useMarkInboxRead, useArchiveInbox, useMarkAllInboxRead, useArchiveAllInbox, useArchiveAllReadInbox, useArchiveCompletedInbox
- `packages/core/workspace/queries.ts` — workspaceListOptions, memberListOptions, agentListOptions, skillListOptions, assigneeFrequencyOptions, workspaceKeys
- `packages/core/chat/queries.ts` — chatSessionsOptions, allChatSessionsOptions, chatSessionOptions, chatMessagesOptions, chatKeys
- `packages/core/platform/workspace-storage.ts` — setCurrentWorkspaceId, registerForWorkspaceRehydration, rehydrateAllWorkspaceStores, getCurrentWorkspaceId, createWorkspaceAwareStorage
- `packages/core/api/client.ts` — ApiError, ApiClient, ApiClientOptions, LoginResponse
- `packages/core/utils.ts` — timeAgo, generateUUID, createSafeId, createRequestId
- `packages/core/api/index.ts` — setApiInstance, getApi, api
- `packages/core/auth/store.ts` — createAuthStore, AuthStoreOptions, AuthState
- `packages/core/hooks/use-file-upload.ts` — useFileUpload, UploadResult, UploadContext
- `packages/core/inbox/queries.ts` — inboxListOptions, deduplicateInboxItems, inboxKeys
- `packages/core/inbox/ws-updaters.ts` — onInboxNew, onInboxIssueStatusChanged, onInboxInvalidate
- `packages/core/issues/ws-updaters.ts` — onIssueCreated, onIssueUpdated, onIssueDeleted
- `packages/core/logger.ts` — createLogger, Logger, noopLogger
- `packages/core/pins/mutations.ts` — useCreatePin, useDeletePin, useReorderPins
- `packages/core/projects/mutations.ts` — useCreateProject, useUpdateProject, useDeleteProject
- `packages/core/projects/queries.ts` — projectListOptions, projectDetailOptions, projectKeys
- `packages/core/runtimes/queries.ts` — runtimeListOptions, latestCliVersionOptions, runtimeKeys
- `packages/core/workspace/mutations.ts` — useCreateWorkspace, useLeaveWorkspace, useDeleteWorkspace
- `packages/core/auth/index.ts` — registerAuthStore, useAuthStore
- `packages/core/chat/index.ts` — registerChatStore, useChatStore
- `packages/core/chat/mutations.ts` — useCreateChatSession, useArchiveChatSession
- _…and 12 more files_

## Desktop (6 files)

- `apps/desktop/src/renderer/src/stores/tab-store.ts` — resolveRouteIcon, Tab, useTabStore
- `apps/desktop/src/renderer/src/hooks/use-tab-history.ts` — useTabHistory, popDirectionHints
- `apps/desktop/src/main/updater.ts` — setupAutoUpdater
- `apps/desktop/src/renderer/src/hooks/use-document-title.ts` — useDocumentTitle
- `apps/desktop/src/renderer/src/hooks/use-tab-router-sync.ts` — useTabRouterSync
- `apps/desktop/src/renderer/src/hooks/use-tab-sync.ts` — useActiveTitleSync

## Ui (6 files)

- `packages/ui/markdown/linkify.ts` — detectLinks, preprocessLinks, hasLinks
- `packages/ui/hooks/use-auto-scroll.ts` — useAutoScroll
- `packages/ui/hooks/use-mobile.ts` — useIsMobile
- `packages/ui/hooks/use-scroll-fade.ts` — useScrollFade
- `packages/ui/lib/utils.ts` — cn
- `packages/ui/markdown/mentions.ts` — preprocessMentionShortcodes

## E2e (2 files)

- `e2e/helpers.ts` — loginAsDefault, createTestApi, openWorkspaceMenu
- `e2e/fixtures.ts` — TestApiClient

## Web (2 files)

- `apps/web/features/auth/auth-cookie.ts` — setLoggedInCookie, clearLoggedInCookie
- `apps/web/proxy.ts` — proxy, config

---
_Back to [overview.md](./overview.md)_