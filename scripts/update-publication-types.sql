-- Update publication types for 3-tier model
UPDATE "ThinkTankPublication" 
SET type = CASE 
  WHEN type = 'RESEARCH_BRIEF' THEN 'EXECUTIVE_BRIEF'
  WHEN type = 'UPDATE_NOTE' THEN 'EXECUTIVE_BRIEF'
  WHEN type = 'DATA_NOTE' THEN 'EXECUTIVE_BRIEF'
  WHEN type = 'POLICY_NOTE' THEN 'EXECUTIVE_BRIEF'
  WHEN type = 'DOSSIER' THEN 'STRATEGIC_REPORT'
  ELSE type
END;

-- Delete existing demo publications to reseed with proper types
DELETE FROM "ThinkTankPublication" WHERE id LIKE 'pub-%';
