ALTER TABLE wiki_comment
  ADD COLUMN parent_id UUID REFERENCES wiki_comment(id) ON DELETE CASCADE;
