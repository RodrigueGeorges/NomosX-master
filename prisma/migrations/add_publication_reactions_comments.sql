-- ============================================================================
-- PUBLICATION REACTIONS & COMMENTS
-- Adds like/dislike and comment functionality to ThinkTankPublication
-- ============================================================================

-- PublicationReaction table (like / dislike)
CREATE TABLE IF NOT EXISTS "PublicationReaction" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationReaction_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one reaction per user per publication
CREATE UNIQUE INDEX IF NOT EXISTS "PublicationReaction_userId_publicationId_key"
    ON "PublicationReaction"("userId", "publicationId");

-- Indexes for efficient counting
CREATE INDEX IF NOT EXISTS "PublicationReaction_publicationId_type_idx"
    ON "PublicationReaction"("publicationId", "type");
CREATE INDEX IF NOT EXISTS "PublicationReaction_userId_idx"
    ON "PublicationReaction"("userId");

-- Foreign keys
ALTER TABLE "PublicationReaction"
    ADD CONSTRAINT "PublicationReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "PublicationReaction"
    ADD CONSTRAINT "PublicationReaction_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "ThinkTankPublication"("id") ON DELETE CASCADE;

-- ----------------------------------------------------------------------------

-- PublicationComment table
CREATE TABLE IF NOT EXISTS "PublicationComment" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "content"       TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationComment_pkey" PRIMARY KEY ("id")
);

-- Indexes for efficient fetching (newest first per publication)
CREATE INDEX IF NOT EXISTS "PublicationComment_publicationId_createdAt_idx"
    ON "PublicationComment"("publicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "PublicationComment_userId_idx"
    ON "PublicationComment"("userId");

-- Foreign keys
ALTER TABLE "PublicationComment"
    ADD CONSTRAINT "PublicationComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "PublicationComment"
    ADD CONSTRAINT "PublicationComment_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "ThinkTankPublication"("id") ON DELETE CASCADE;
