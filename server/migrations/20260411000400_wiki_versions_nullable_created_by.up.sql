-- wiki_versions.created_by를 nullable로 변경.
-- 협업 세션 자동 스냅샷(debounce snapshot)은 특정 사용자에게 귀속되지 않으므로 NULL 허용.
ALTER TABLE wiki_versions ALTER COLUMN created_by DROP NOT NULL;
