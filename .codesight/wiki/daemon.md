# Daemon

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Daemon subsystem handles **16 routes** and touches: auth, db, payment.

## Routes

- `POST` `/api/daemon/deregister` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/heartbeat` [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/runtimes/{runtimeId}/tasks/claim` params(runtimeId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/daemon/runtimes/{runtimeId}/tasks/pending` params(runtimeId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/runtimes/{runtimeId}/usage` params(runtimeId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/runtimes/{runtimeId}/ping/{pingId}/result` params(runtimeId, pingId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/runtimes/{runtimeId}/update/{updateId}/result` params(runtimeId, updateId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/daemon/tasks/{taskId}/status` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/tasks/{taskId}/start` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/tasks/{taskId}/progress` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/tasks/{taskId}/complete` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/tasks/{taskId}/fail` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/tasks/{taskId}/usage` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `POST` `/api/daemon/tasks/{taskId}/messages` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/daemon/tasks/{taskId}/messages` params(taskId) [auth, db, payment, upload]
  `server/cmd/server/router.go`
- `GET` `/api/daemon/issues/{issueId}/gc-check` params(issueId) [auth, db, payment, upload]
  `server/cmd/server/router.go`

## Related Models

- **daemon_connection** (6 fields) → [database.md](./database.md)
- **daemon_pairing_session** (13 fields) → [database.md](./database.md)
- **daemon_token** (5 fields) → [database.md](./database.md)

## Source Files

Read these before implementing or modifying this subsystem:
- `server/cmd/server/router.go`

---
_Back to [overview.md](./overview.md)_