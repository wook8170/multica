# Project Context

This is a typescript project using next-app.
It is a monorepo with workspaces: @multica/collaboration (apps/collaboration), @multica/desktop (apps/desktop), @multica/docs (apps/docs), @multica/web (apps/web), @multica/core (packages/core), @multica/eslint-config (packages/eslint-config), @multica/tsconfig (packages/tsconfig), @multica/ui (packages/ui), @multica/views (packages/views).

The API has 18 routes. See .codesight/routes.md for the full route map with methods, paths, and tags.
The database has 35 models. See .codesight/schema.md for the full schema with fields, types, and relations.
The UI has 162 components. See .codesight/components.md for the full list with props.
Middleware includes: auth, logging, custom.

High-impact files (most imported, changes here affect many other files):
- encoding/json (imported by 54 files)
- net/http (imported by 49 files)
- log/slog (imported by 47 files)
- packages/core/types/index.ts (imported by 23 files)
- path/filepath (imported by 20 files)
- packages/views/common/actor-avatar.tsx (imported by 19 files)
- packages/core/api/index.ts (imported by 16 files)
- packages/views/navigation/index.ts (imported by 15 files)

Required environment variables (no defaults):
- APP_ENV (server/internal/handler/auth.go)
- CLAUDE_CONFIG_DIR (server/internal/daemon/usage/claude.go)
- CLOUDFRONT_DOMAIN (.env.example)
- CLOUDFRONT_KEY_PAIR_ID (.env.example)
- CLOUDFRONT_PRIVATE_KEY (.env.example)
- CODEX_HOME (server/internal/daemon/execenv/codex_home.go)
- COOKIE_DOMAIN (.env.example)
- CORS_ALLOWED_ORIGINS (apps/web/next.config.ts)
- ELECTRON_RENDERER_URL (apps/desktop/src/main/index.ts)
- GOOGLE_CLIENT_ID (.env.example)
- GOOGLE_CLIENT_SECRET (.env.example)
- LOG_LEVEL (server/internal/logger/logger.go)
- MULTICA_AGENT_ID (server/cmd/multica/cmd_agent.go)
- MULTICA_AGENT_NAME (server/cmd/multica/cmd_repo.go)
- MULTICA_CLAUDE_MODEL (server/internal/daemon/config.go)

Read .codesight/wiki/index.md for orientation (WHERE things live). Then read actual source files before implementing. Wiki articles are navigation aids, not implementation guides.
Read .codesight/CODESIGHT.md for the complete AI context map including all routes, schema, components, libraries, config, middleware, and dependency graph.
