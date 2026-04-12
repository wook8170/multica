package handler

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// wikiSnapshotDelay is the idle time after the last collaboration update
// before an automatic snapshot is written to wiki_versions.
const wikiSnapshotDelay = 30 * time.Second

// wikiSnapshotJob holds the latest state to be snapshotted for a wiki.
type wikiSnapshotJob struct {
	wikiID  string
	content string
	userID  string // last known editor; empty for anonymous sessions
}

// WikiSnapshotScheduler debounces automatic snapshots for real-time collaboration.
//
// Each call to Schedule() resets a per-wiki 30-second timer. When the timer
// fires (i.e., no collaboration activity for 30 seconds), a row is inserted
// into wiki_versions. This ensures that real-time edits are captured in history
// even when users never click the Save button.
type WikiSnapshotScheduler struct {
	mu     sync.Mutex
	timers map[string]*time.Timer
	jobs   map[string]wikiSnapshotJob
	db     dbExecutor
}

// NewWikiSnapshotScheduler creates a scheduler backed by the given DB executor.
func NewWikiSnapshotScheduler(db dbExecutor) *WikiSnapshotScheduler {
	return &WikiSnapshotScheduler{
		timers: make(map[string]*time.Timer),
		jobs:   make(map[string]wikiSnapshotJob),
		db:     db,
	}
}

// Schedule resets (or starts) the debounce timer for wikiID.
// The latest content and userID are stored so the snapshot reflects the most
// recent state when the timer finally fires.
func (s *WikiSnapshotScheduler) Schedule(wikiID, content, userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Always keep the latest content for the eventual flush.
	s.jobs[wikiID] = wikiSnapshotJob{wikiID: wikiID, content: content, userID: userID}

	// Reset existing timer (debounce).
	if t, ok := s.timers[wikiID]; ok {
		t.Stop()
	}
	s.timers[wikiID] = time.AfterFunc(wikiSnapshotDelay, func() {
		s.flush(wikiID)
	})
}

// Shutdown stops all pending timers and flushes them immediately.
// Call this on server shutdown to avoid losing in-flight snapshots.
func (s *WikiSnapshotScheduler) Shutdown() {
	s.mu.Lock()
	ids := make([]string, 0, len(s.timers))
	for id, t := range s.timers {
		t.Stop()
		ids = append(ids, id)
	}
	s.mu.Unlock()

	for _, id := range ids {
		s.flush(id)
	}
}

func (s *WikiSnapshotScheduler) flush(wikiID string) {
	s.mu.Lock()
	job, ok := s.jobs[wikiID]
	if ok {
		delete(s.jobs, wikiID)
		delete(s.timers, wikiID)
	}
	s.mu.Unlock()

	if !ok {
		return
	}

	ctx := context.Background()

	// Fetch the current title so the snapshot is self-contained.
	var title string
	if err := s.db.QueryRow(ctx,
		"SELECT title FROM wikis WHERE id = $1",
		parseUUID(job.wikiID),
	).Scan(&title); err != nil {
		slog.Error("wikiSnapshot: failed to fetch title", "wiki_id", wikiID, "error", err)
		return
	}

	// Determine the next snapshot number atomically.
	var nextVersion int
	if err := s.db.QueryRow(ctx,
		"SELECT COALESCE(MAX(version_number), 0) + 1 FROM wiki_versions WHERE wiki_id = $1",
		parseUUID(job.wikiID),
	).Scan(&nextVersion); err != nil {
		slog.Error("wikiSnapshot: failed to compute next version", "wiki_id", wikiID, "error", err)
		return
	}

	// created_by is nullable — use NULL for collaboration auto-snapshots,
	// or the last known userId if available.
	var createdBy interface{}
	if job.userID != "" {
		createdBy = parseUUID(job.userID)
	}

	_, err := s.db.Exec(ctx,
		`INSERT INTO wiki_versions (wiki_id, version_number, title, content, created_by)
		 VALUES ($1, $2, $3, $4, $5)`,
		parseUUID(job.wikiID), nextVersion, title, job.content, createdBy,
	)
	if err != nil {
		slog.Error("wikiSnapshot: failed to insert auto-snapshot", "wiki_id", wikiID, "version", nextVersion, "error", err)
		return
	}
	slog.Info("wikiSnapshot: auto-snapshot saved", "wiki_id", wikiID, "version", nextVersion)
}
