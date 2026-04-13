# Dependency Graph

## Most Imported Files (change these carefully)

- `encoding/json` — imported by **54** files
- `net/http` — imported by **49** files
- `log/slog` — imported by **48** files
- `packages/core/types/index.ts` — imported by **23** files
- `path/filepath` — imported by **20** files
- `packages/views/common/actor-avatar.tsx` — imported by **19** files
- `packages/core/api/index.ts` — imported by **16** files
- `packages/views/navigation/index.ts` — imported by **15** files
- `os/exec` — imported by **12** files
- `apps/web/features/landing/i18n/index.ts` — imported by **10** files
- `packages/core/types/storage.ts` — imported by **10** files
- `packages/core/platform/storage.ts` — imported by **9** files
- `apps/web/features/landing/components/shared.tsx` — imported by **8** files
- `packages/core/platform/workspace-storage.ts` — imported by **8** files
- `packages/views/issues/components/status-icon.tsx` — imported by **8** files
- `packages/views/issues/components/index.ts` — imported by **8** files
- `packages/views/editor/index.ts` — imported by **8** files
- `packages/views/runtimes/utils.ts` — imported by **8** files
- `net/http/httptest` — imported by **8** files
- `packages/core/logger.ts` — imported by **7** files

## Import Map (who imports what)

- `encoding/json` ← `server/cmd/multica/cmd_agent.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_issue_test.go`, `server/cmd/multica/cmd_repo.go`, `server/cmd/multica/cmd_skill.go` +49 more
- `net/http` ← `server/cmd/multica/cmd_auth.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_issue_test.go`, `server/cmd/multica/cmd_repo.go`, `server/cmd/server/comment_trigger_integration_test.go` +44 more
- `log/slog` ← `server/cmd/migrate/main.go`, `server/cmd/server/activity_listeners.go`, `server/cmd/server/listeners.go`, `server/cmd/server/main.go`, `server/cmd/server/notification_listeners.go` +43 more
- `packages/core/types/index.ts` ← `packages/core/auth/store.ts`, `packages/core/chat/store.ts`, `packages/core/hooks/use-file-upload.ts`, `packages/core/inbox/mutations.ts`, `packages/core/inbox/queries.ts` +18 more
- `path/filepath` ← `server/cmd/migrate/main.go`, `server/cmd/multica/cmd_attachment.go`, `server/internal/cli/client.go`, `server/internal/cli/config.go`, `server/internal/cli/update.go` +15 more
- `packages/views/common/actor-avatar.tsx` ← `packages/views/agents/components/agent-detail.tsx`, `packages/views/agents/components/agent-list-item.tsx`, `packages/views/agents/components/tabs/settings-tab.tsx`, `packages/views/editor/extensions/mention-suggestion.tsx`, `packages/views/inbox/components/inbox-list-item.tsx` +14 more
- `packages/core/api/index.ts` ← `packages/core/chat/mutations.ts`, `packages/core/chat/queries.ts`, `packages/core/inbox/mutations.ts`, `packages/core/inbox/queries.ts`, `packages/core/issues/mutations.ts` +11 more
- `packages/views/navigation/index.ts` ← `packages/views/editor/extensions/mention-view.tsx`, `packages/views/editor/readonly-content.tsx`, `packages/views/inbox/components/inbox-page.tsx`, `packages/views/issues/components/board-card.tsx`, `packages/views/issues/components/issue-detail.tsx` +10 more
- `os/exec` ← `server/cmd/multica/cmd_auth.go`, `server/cmd/multica/cmd_daemon.go`, `server/internal/cli/update.go`, `server/internal/daemon/config.go`, `server/internal/daemon/execenv/git.go` +7 more
- `apps/web/features/landing/i18n/index.ts` ← `apps/web/features/landing/components/about-page-client.tsx`, `apps/web/features/landing/components/changelog-page-client.tsx`, `apps/web/features/landing/components/faq-section.tsx`, `apps/web/features/landing/components/features-section.tsx`, `apps/web/features/landing/components/features-section.tsx` +5 more
