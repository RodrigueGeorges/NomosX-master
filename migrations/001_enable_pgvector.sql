/**
 * ACTIVATION PGVECTOR - Migration SQL
 * Extension pgvector pour embeddings
 */

-- Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Mettre à jour la table Source avec colonne vectorielle
ALTER TABLE Source 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Mettre à jour la table SourceChunk avec colonne vectorielle  
ALTER TABLE SourceChunk
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Créer les index vectoriels pour performance
CREATE INDEX IF NOT EXISTS idx_source_embedding_cosine 
ON Source 
USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_sourcechunk_embedding_cosine
ON SourceChunk 
USING ivfflat (embedding vector_cosine_ops);

-- Index full-text pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_source_fulltext
ON Source 
USING gin(to_tsvector('english', title || ' ' || COALESCE(abstract, '')));

CREATE INDEX IF NOT EXISTS idx_sourcechunk_fulltext
ON SourceChunk 
USING gin(to_tsvector('english', content));
