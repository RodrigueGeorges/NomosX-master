-- Enable pgvector extension (Neon supports it natively)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add native vector column alongside existing Float[] JSON column
-- We keep embeddings Float[] for backward compat and add embedding vector(3072)
ALTER TABLE "Source" ADD COLUMN IF NOT EXISTS "embedding" vector(3072);
ALTER TABLE "SourceChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(3072);
ALTER TABLE "ConceptNode" ADD COLUMN IF NOT EXISTS "embedding_vec" vector(3072);

-- Copy existing Float[] data into vector column
-- (run once — data migration for rows that already have embeddings)
UPDATE "Source"
SET embedding = embeddings::text::vector
WHERE array_length(embeddings, 1) = 3072 AND embedding IS NULL;

UPDATE "SourceChunk"
SET embedding = (
  SELECT array_to_string(ARRAY(
    SELECT unnest(s."embeddings")
  ), ',')::vector
  FROM "Source" s WHERE s.id = "SourceChunk"."sourceId"
  LIMIT 1
)
WHERE embedding IS NULL;

-- HNSW indexes for fast approximate nearest neighbor (cosine distance)
-- Run each statement SEPARATELY in the Neon SQL editor (CONCURRENTLY not allowed inside implicit transactions)
CREATE INDEX IF NOT EXISTS "source_embedding_hnsw_idx"
  ON "Source" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "source_chunk_embedding_hnsw_idx"
  ON "SourceChunk" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
