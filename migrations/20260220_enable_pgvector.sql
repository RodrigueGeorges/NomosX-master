-- Enable pgvector extension for vector embeddings
-- Migration: 20260220_enable_pgvector.sql

-- Create pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector columns for embeddings
ALTER TABLE "Source" 
ADD COLUMN "embedding" vector(1536);

ALTER TABLE "SourceChunk" 
ADD COLUMN "embedding" vector(1536);

-- Create vector indexes for similarity search
CREATE INDEX "Source_embedding_idx" ON "Source" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX "SourceChunk_embedding_idx" ON "SourceChunk" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Add vector similarity search function
CREATE OR REPLACE FUNCTION find_similar_sources(query_embedding vector(1536), limit_count int DEFAULT 10)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    1 - (s.embedding <=> query_embedding) as similarity,
    s.raw as metadata
  FROM "Source" s
  WHERE s.embedding IS NOT NULL
  ORDER BY s.embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Add function for finding similar chunks
CREATE OR REPLACE FUNCTION find_similar_chunks(query_embedding vector(1536), limit_count int DEFAULT 10)
RETURNS TABLE (
  id TEXT,
  sourceId TEXT,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc."sourceId",
    sc.content,
    1 - (sc.embedding <=> query_embedding) as similarity,
    sc.metadata
  FROM "SourceChunk" sc
  WHERE sc.embedding IS NOT NULL
  ORDER BY sc.embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION find_similar_sources TO PUBLIC;
GRANT EXECUTE ON FUNCTION find_similar_chunks TO PUBLIC;
