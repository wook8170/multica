# multica — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**multica** is a typescript project built with next-app, chi, organized as a monorepo.

**Workspaces:** `@multica/collaboration` (`apps/collaboration`), `@multica/desktop` (`apps/desktop`), `@multica/docs` (`apps/docs`), `@multica/web` (`apps/web`), `@multica/core` (`packages/core`), `@multica/eslint-config` (`packages/eslint-config`), `@multica/tsconfig` (`packages/tsconfig`), `@multica/ui` (`packages/ui`), `@multica/views` (`packages/views`), `server` (`server`)

## Scale

284 API routes · 35 database models · 164 UI components · 137 library files · 15 middleware layers · 72 environment variables

## Subsystems

- **[Auth](./auth.md)** — 5 routes — touches: auth, db, payment, upload
- **[Payments](./payments.md)** — 5 routes — touches: auth, db, payment, upload, cache
- **[X-Agent-ID](./x-agent-id.md)** — 1 routes — touches: auth, db
- **[X-Task-ID](./x-task-id.md)** — 1 routes — touches: auth, db
- **[X-User-ID](./x-user-id.md)** — 1 routes — touches: auth, db
- **[Active-task](./active-task.md)** — 2 routes — touches: auth, db, payment, upload
- **[Activity](./activity.md)** — 2 routes — touches: auth, db, payment, upload
- **[Agent](./agent.md)** — 1 routes — touches: auth, db, queue
- **[Agents](./agents.md)** — 8 routes — touches: auth, db, payment, upload
- **[Archive](./archive.md)** — 2 routes — touches: auth, db, payment, upload
- **[Archive-all](./archive-all.md)** — 1 routes — touches: auth, db, payment, upload
- **[Archive-all-read](./archive-all-read.md)** — 1 routes — touches: auth, db, payment, upload
- **[Archive-completed](./archive-completed.md)** — 1 routes — touches: auth, db, payment, upload
- **[Assignee-frequency](./assignee-frequency.md)** — 1 routes — touches: auth, db, payment, upload
- **[Attachments](./attachments.md)** — 4 routes — touches: auth, db, payment, upload
- **[Auth_test](./auth_test.md)** — 1 routes — touches: auth
- **[Batch-delete](./batch-delete.md)** — 1 routes — touches: auth, db, payment, upload
- **[Batch-update](./batch-update.md)** — 1 routes — touches: auth, db, payment, upload
- **[Chat](./chat.md)** — 6 routes — touches: auth, db, payment, upload, queue
- **[Children](./children.md)** — 2 routes — touches: auth, db, payment, upload
- **[Client_test](./client_test.md)** — 3 routes — touches: auth
- **[Cmd_auth](./cmd_auth.md)** — 3 routes — touches: auth, db
- **[Cmd_issue](./cmd_issue.md)** — 1 routes — touches: auth, upload
- **[Comment](./comment.md)** — 3 routes — touches: auth, db, queue, upload
- **[Comments](./comments.md)** — 8 routes — touches: auth, db, payment, upload
- **[Daemon](./daemon.md)** — 15 routes — touches: auth, db, payment, upload
- **[Daily](./daily.md)** — 1 routes — touches: auth, db, payment, upload
- **[Deregister](./deregister.md)** — 1 routes — touches: auth, db, payment, upload
- **[Files](./files.md)** — 6 routes — touches: auth, db, payment, upload
- **[Heartbeat](./heartbeat.md)** — 1 routes — touches: auth, db, payment, upload
- **[History](./history.md)** — 4 routes — touches: auth, db, payment, upload
- **[Hub_test](./hub_test.md)** — 1 routes — touches: auth
- **[Import](./import.md)** — 1 routes — touches: auth, db, payment, upload
- **[Inbox](./inbox.md)** — 8 routes — touches: auth, db, payment, upload
- **[Issue](./issue.md)** — 7 routes — touches: auth, db, queue, upload
- **[Issues](./issues.md)** — 20 routes — touches: auth, db, payment, upload
- **[Leave](./leave.md)** — 2 routes — touches: auth, db, payment, upload
- **[Mark-all-read](./mark-all-read.md)** — 1 routes — touches: auth, db, payment, upload
- **[Me](./me.md)** — 2 routes — touches: auth, db, payment, upload
- **[Members](./members.md)** — 6 routes — touches: auth, db, payment, upload
- **[Messages](./messages.md)** — 2 routes — touches: auth, db, payment, upload
- **[Move](./move.md)** — 2 routes — touches: auth, db, payment, upload
- **[Ping](./ping.md)** — 2 routes — touches: auth, db, payment, upload
- **[Pins](./pins.md)** — 4 routes — touches: auth, db, payment, upload
- **[Projects](./projects.md)** — 5 routes — touches: auth, db, payment, upload
- **[Reactions](./reactions.md)** — 4 routes — touches: auth, db, payment, upload
- **[Read](./read.md)** — 1 routes — touches: auth, db, payment, upload
- **[Reorder](./reorder.md)** — 1 routes — touches: auth, db, payment, upload
- **[Restore](./restore.md)** — 2 routes — touches: auth, db, payment, upload
- **[Route](./route.md)** — 1 routes
- **[Runtime](./runtime.md)** — 2 routes — touches: auth, db, cache
- **[Runtimes](./runtimes.md)** — 13 routes — touches: auth, db, payment, upload
- **[Search](./search.md)** — 1 routes — touches: auth, db, payment, upload
- **[Skills](./skills.md)** — 12 routes — touches: auth, db, payment, upload
- **[Subscribers](./subscribers.md)** — 2 routes — touches: auth, db, payment, upload
- **[Summary](./summary.md)** — 1 routes — touches: auth, db, payment, upload
- **[Task-runs](./task-runs.md)** — 2 routes — touches: auth, db, payment, upload
- **[Tasks](./tasks.md)** — 13 routes — touches: auth, db, payment, upload
- **[Timeline](./timeline.md)** — 2 routes — touches: auth, db, payment, upload
- **[Tokens](./tokens.md)** — 3 routes — touches: auth, db, payment, upload
- **[Unread-count](./unread-count.md)** — 1 routes — touches: auth, db, payment, upload
- **[Unsubscribe](./unsubscribe.md)** — 2 routes — touches: auth, db, payment, upload
- **[Update](./update.md)** — 4 routes — touches: auth, db, payment, upload
- **[Upload-file](./upload-file.md)** — 1 routes — touches: auth, db, payment, upload
- **[Usage](./usage.md)** — 5 routes — touches: auth, db, payment, upload
- **[Use-realtime-sync](./use-realtime-sync.md)** — 17 routes
- **[Wiki](./wiki.md)** — 1 routes — touches: auth, db, payment
- **[Wikis](./wikis.md)** — 8 routes — touches: auth, db, payment, upload
- **[Workspace-id](./workspace-id.md)** — 1 routes — touches: auth, db
- **[Workspaces](./workspaces.md)** — 8 routes — touches: auth, db, payment, upload
- **[Ws](./ws.md)** — 1 routes — touches: auth, db, payment, upload
- **[Infra](./infra.md)** — 11 routes — touches: auth, db, payment, upload, cache
- **[Api](./api.md)** — 8 routes — touches: auth, db, payment, upload

**Database:** unknown, 35 models — see [database.md](./database.md)

**UI:** 164 components (react) — see [ui.md](./ui.md)

**Libraries:** 137 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `encoding/json` — imported by **54** files
- `log/slog` — imported by **49** files
- `net/http` — imported by **49** files
- `packages/core/types/index.ts` — imported by **23** files
- `path/filepath` — imported by **20** files
- `packages/views/common/actor-avatar.tsx` — imported by **19** files

## Required Environment Variables

- `APP_ENV` — `server/internal/handler/auth.go`
- `CLAUDE_CONFIG_DIR` — `server/internal/daemon/usage/claude.go`
- `CLOUDFRONT_DOMAIN` — `.env.example`
- `CLOUDFRONT_KEY_PAIR_ID` — `.env.example`
- `CLOUDFRONT_PRIVATE_KEY` — `.env.example`
- `CODEX_HOME` — `server/internal/daemon/execenv/codex_home.go`
- `COOKIE_DOMAIN` — `.env.example`
- `CORS_ALLOWED_ORIGINS` — `apps/web/next.config.ts`
- `ELECTRON_RENDERER_URL` — `apps/desktop/src/main/index.ts`
- `GOOGLE_CLIENT_ID` — `.env.example`
- `GOOGLE_CLIENT_SECRET` — `.env.example`
- `LOG_LEVEL` — `server/internal/logger/logger.go`
- _...26 more_

---
_Back to [index.md](./index.md) · Generated 2026-04-14_