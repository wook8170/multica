# Dependency Graph

## Most Imported Files (change these carefully)

- `encoding/json` — imported by **66** files
- `net/http` — imported by **58** files
- `log/slog` — imported by **56** files
- `path/filepath` — imported by **32** files
- `packages/core/types/index.ts` — imported by **29** files
- `packages/views/common/actor-avatar.tsx` — imported by **19** files
- `packages/core/api/index.ts` — imported by **18** files
- `os/exec` — imported by **16** files
- `packages/views/navigation/index.ts` — imported by **15** files
- `net/http/httptest` — imported by **13** files
- `apps/web/features/landing/i18n/index.ts` — imported by **10** files
- `packages/core/platform/storage.ts` — imported by **10** files
- `packages/core/types/storage.ts` — imported by **10** files
- `packages/views/editor/index.ts` — imported by **10** files
- `packages/core/platform/workspace-storage.ts` — imported by **9** files
- `apps/web/features/landing/components/shared.tsx` — imported by **8** files
- `packages/core/api/client.ts` — imported by **8** files
- `packages/views/issues/components/status-icon.tsx` — imported by **8** files
- `packages/views/issues/components/index.ts` — imported by **8** files
- `packages/views/runtimes/utils.ts` — imported by **8** files

## Import Map (who imports what)

- `encoding/json` ← `server/cmd/multica/cmd_agent.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_issue_test.go`, `server/cmd/multica/cmd_repo.go`, `server/cmd/multica/cmd_skill.go` +61 more
- `net/http` ← `server/cmd/multica/cmd_auth.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_issue_test.go`, `server/cmd/multica/cmd_repo.go`, `server/cmd/multica/cmd_setup.go` +53 more
- `log/slog` ← `server/cmd/migrate/main.go`, `server/cmd/server/activity_listeners.go`, `server/cmd/server/listeners.go`, `server/cmd/server/main.go`, `server/cmd/server/notification_listeners.go` +51 more
- `path/filepath` ← `server/cmd/migrate/main.go`, `server/cmd/multica/cmd_attachment.go`, `server/cmd/multica/cmd_daemon.go`, `server/internal/cli/client.go`, `server/internal/cli/config.go` +27 more
- `packages/core/types/index.ts` ← `packages/core/api/client.ts`, `packages/core/api/client.ts`, `packages/core/api/client.ts`, `packages/core/auth/store.ts`, `packages/core/chat/mutations.ts` +24 more
- `packages/views/common/actor-avatar.tsx` ← `packages/views/agents/components/agent-detail.tsx`, `packages/views/agents/components/agent-list-item.tsx`, `packages/views/agents/components/tabs/settings-tab.tsx`, `packages/views/editor/extensions/mention-suggestion.tsx`, `packages/views/inbox/components/inbox-list-item.tsx` +14 more
- `packages/core/api/index.ts` ← `packages/core/chat/mutations.ts`, `packages/core/chat/queries.ts`, `packages/core/inbox/mutations.ts`, `packages/core/inbox/queries.ts`, `packages/core/issues/mutations.ts` +13 more
- `os/exec` ← `server/cmd/multica/cmd_auth.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_daemon_unix.go`, `server/internal/cli/update.go`, `server/internal/daemon/config.go` +11 more
- `packages/views/navigation/index.ts` ← `packages/views/editor/extensions/mention-view.tsx`, `packages/views/editor/readonly-content.tsx`, `packages/views/inbox/components/inbox-page.tsx`, `packages/views/issues/components/board-card.tsx`, `packages/views/issues/components/issue-detail.tsx` +10 more
- `net/http/httptest` ← `server/cmd/multica/cmd_issue_test.go`, `server/cmd/server/integration_test.go`, `server/internal/cli/client_test.go`, `server/internal/daemon/daemon_test.go`, `server/internal/daemon/gc_test.go` +8 more
