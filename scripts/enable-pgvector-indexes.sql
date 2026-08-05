-- F-B16: Create HNSW vector indexes for pgvector cosine similarity search
-- Run this after `prisma db push` to add indexes that Prisma can't declare natively

-- Source embedding index (1536 dims, cosine distance)
CREATE INDEX IF NOT EXISTS source_embedding_hnsw_idx
  ON "Source" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- SourceChunk embedding index (1536 dims, cosine distance)
CREATE INDEX IF NOT EXISTS sourcechunk_embedding_hnsw_idx
  ON "SourceChunk" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
