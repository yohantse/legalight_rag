-- Run this once against your database.
-- Requires the pgvector extension (available on most managed Postgres,
-- and installable on your own Hetzner box: https://github.com/pgvector/pgvector)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,          -- e.g. filename or doc title
  chunk_index INT NOT NULL,      -- position of this chunk within the source doc
  content TEXT NOT NULL,         -- the actual chunk text
  embedding VECTOR(384),         -- all-MiniLM-L6-v2 (local, free) produces 384-dim vectors
  created_at TIMESTAMPTZ DEFAULT now()
);

-- An IVFFlat index speeds up similarity search once you have real volume.
-- Skip this until you have a few thousand+ chunks; not needed for a Week 1 demo.
-- CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- For Week 2, you'll add a full-text search column here for hybrid search:
-- ALTER TABLE document_chunks ADD COLUMN content_tsv TSVECTOR
--   GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
-- CREATE INDEX ON document_chunks USING GIN (content_tsv);
