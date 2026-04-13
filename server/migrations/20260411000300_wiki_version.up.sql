-- wikis 테이블에 낙관적 락을 위한 version 컬럼 추가.
-- 저장 시마다 1씩 증가하고, UpdateWiki는 base_version과 일치할 때만 커밋.
ALTER TABLE wikis ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
