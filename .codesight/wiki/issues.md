# Issues

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Issues subsystem handles **20 routes** and touches: auth, db, payment.

## Routes

- `GET` `/api/issues/search` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues/batch-update` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues/batch-delete` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `PUT` `/api/issues` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/api/issues` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues/comments` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/comments` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/timeline` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/subscribers` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues/unsubscribe` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/active-task` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues/tasks/{taskId}/cancel` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/task-runs` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/usage` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/issues/reactions` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `DELETE` `/api/issues/reactions` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/attachments` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/issues/children` [auth, db, payment, upload]
  `server/cmd/server/router.go`

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`

---
_Back to [overview.md](./overview.md)_