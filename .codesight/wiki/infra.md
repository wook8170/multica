# Infra

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Infra subsystem handles **11 routes** and touches: auth, db, payment, cache.

## Routes

- `GET` `/health` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PUT` `/` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PATCH` `/` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/ping` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/ping/{pingId}` params(pingId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/messages` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/messages` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `ALL` `/health` [cache, payment]
  `server/internal/daemon/health.go`

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`
- `server/internal/daemon/health.go`

---
_Back to [overview.md](./overview.md)_