package handler

import (
	"context"
	"log/slog"
	"time"
)

const (
	wikiHistoryRecentKeep     = 20
	wikiHistoryBinaryKeep     = 10
	wikiHistoryCompactAfter   = 30 * 24 * time.Hour
	wikiHistoryDailyKeepCount = 1
)

type WikiHistoryCompactResult struct {
	DeletedVersions    int64 `json:"deleted_versions"`
	ClearedBinaryState int64 `json:"cleared_binary_state"`
}

// compactWikiHistory applies the wiki history retention policy:
// - keep the latest 20 versions in full
// - after 30 days, keep only one representative version per day
// - keep Yjs binary_state only on the latest 10 versions
func compactWikiHistory(ctx context.Context, exec dbExecutor, wikiID string) (WikiHistoryCompactResult, error) {
	var result WikiHistoryCompactResult
	wikiUUID := parseUUID(wikiID)
	compactBefore := time.Now().Add(-wikiHistoryCompactAfter)

	tag, err := exec.Exec(ctx, `
		WITH ranked AS (
			SELECT
				id,
				created_at,
				ROW_NUMBER() OVER (ORDER BY version_number DESC) AS recent_rank,
				ROW_NUMBER() OVER (
					PARTITION BY created_at::date
					ORDER BY version_number DESC
				) AS daily_rank
			FROM wiki_versions
			WHERE wiki_id = $1
		)
		DELETE FROM wiki_versions v
		USING ranked r
		WHERE v.id = r.id
		  AND r.recent_rank > $2
		  AND r.created_at < $3
		  AND r.daily_rank > $4
	`, wikiUUID, wikiHistoryRecentKeep, compactBefore, wikiHistoryDailyKeepCount)
	if err != nil {
		slog.Warn("wikiHistory: compaction failed", "wiki_id", wikiID, "error", err)
		return result, err
	}
	result.DeletedVersions = tag.RowsAffected()

	tag, err = exec.Exec(ctx, `
		WITH ranked AS (
			SELECT
				id,
				ROW_NUMBER() OVER (ORDER BY version_number DESC) AS recent_rank
			FROM wiki_versions
			WHERE wiki_id = $1
		)
		UPDATE wiki_versions v
		   SET binary_state = NULL
		  FROM ranked r
		 WHERE v.id = r.id
		   AND r.recent_rank > $2
		   AND v.binary_state IS NOT NULL
	`, wikiUUID, wikiHistoryBinaryKeep)
	if err != nil {
		slog.Warn("wikiHistory: binary compaction failed", "wiki_id", wikiID, "error", err)
		return result, err
	}
	result.ClearedBinaryState = tag.RowsAffected()

	return result, nil
}
