# Wikis

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Wikis subsystem handles **13 routes** and touches: auth, db, payment.

## Routes

- `GET` `/api/wikis` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/wikis/search` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/wikis` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PUT` `/api/wikis` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/wikis/draft` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PUT` `/api/wikis/draft` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/api/wikis/draft` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PATCH` `/api/wikis/move` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/api/wikis` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/wikis/history` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/wikis/history/compact` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/wikis/comments` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/wikis/comments` [auth, db, payment, upload]
  `server/cmd/server/router.go`

## Related Models

- **wikis** (6 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`

---
_Back to [overview.md](./overview.md)_