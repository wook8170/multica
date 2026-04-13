# multica — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**multica** is a typescript project built with next-app, organized as a monorepo.

**Workspaces:** `@multica/collaboration` (`apps/collaboration`), `@multica/desktop` (`apps/desktop`), `@multica/docs` (`apps/docs`), `@multica/web` (`apps/web`), `@multica/core` (`packages/core`), `@multica/eslint-config` (`packages/eslint-config`), `@multica/tsconfig` (`packages/tsconfig`), `@multica/ui` (`packages/ui`), `@multica/views` (`packages/views`)

## Scale

18 API routes · 35 database models · 163 UI components · 15 middleware layers · 72 environment variables

## Subsystems

- **[Route](./route.md)** — 1 routes
- **[Use-realtime-sync](./use-realtime-sync.md)** — 17 routes

**Database:** unknown, 35 models — see [database.md](./database.md)

**UI:** 163 components (react) — see [ui.md](./ui.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `encoding/json` — imported by **54** files
- `net/http` — imported by **49** files
- `log/slog` — imported by **48** files
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
_Back to [index.md](./index.md) · Generated 2026-04-13_