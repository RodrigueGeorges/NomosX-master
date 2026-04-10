-- NOMOSX FORMAT SYSTEM DATABASE SCHEMA
-- Generated: 2026-02-27T10:40:00.000Z

-- Format configuration table
CREATE TABLE publication_formats (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('FREE', 'PREMIUM', 'ENTERPRISE')),
  total_words INTEGER NOT NULL,
  lawzero_inspired BOOLEAN DEFAULT FALSE,
  validation_rules JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Format sections table
CREATE TABLE format_sections (
  id SERIAL PRIMARY KEY,
  format_id INTEGER REFERENCES publication_formats(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  word_target INTEGER NOT NULL,
  percentage_target DECIMAL(5,2) NOT NULL,
  content_description TEXT,
  is_required BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update publications table
ALTER TABLE publications ADD COLUMN IF NOT EXISTS format_id INTEGER REFERENCES publication_formats(id);
ALTER TABLE publications ADD COLUMN IF NOT EXISTS format_compliance VARCHAR(20) DEFAULT 'NONE';
ALTER TABLE publications ADD COLUMN IF NOT EXISTS word_count_actual INTEGER DEFAULT 0;
ALTER TABLE publications ADD COLUMN validation_errors JSONB;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_publications_format_id ON publications(format_id);
CREATE INDEX IF NOT EXISTS idx_publications_compliance ON publications(format_compliance);
CREATE INDEX IF NOT EXISTS idx_publications_word_count ON publications(word_count_actual);

-- Insert format configurations
INSERT INTO publication_formats (name, tier, total_words, lawzero_inspired, validation_rules) VALUES
  ('Summary Report', 'FREE', 600, true, '{"minWords":550,"maxWords":650,"requiredSections":["Executive Summary","Key Findings","Conclusion"],"titleFormat":"[Concept]: [Subtitle"]}'),
  ('Executive Brief', 'PREMIUM', 2000, true, '{"minWords":1900,"maxWords":2100,"requiredSections":["Executive Summary","Context Analysis","Key Findings","Strategic Implications","Recommendations"],"citationsRequired":true,"methodologyRequired":true}'),
  ('Strategic Brief', 'ENTERPRISE', 5000, true, '{"minWords":4800,"maxWords":5200,"requiredSections":["Executive Summary","Strategic Context","Comprehensive Analysis","Risk Assessment","Implementation Roadmap","Strategic Recommendations","ROI Analysis","Monitoring Framework"],"citationsRequired":true,"methodologyRequired":true,"riskAssessmentRequired":true,"roiAnalysisRequired":true}');

-- Insert Summary Report sections
INSERT INTO format_sections (format_id, name, word_target, percentage_target, content_description, is_required, order_index) VALUES
  (1, 'Executive Summary', 150, 25.0, 'Vue d''ensemble rapide du problème et de l''approche', true, 1),
  (1, 'Key Findings', 300, 50.0, '3-5 points clés avec données spécifiques', true, 2),
  (1, 'Conclusion', 150, 25.0, 'Synthèse des implications principales', true, 3);

-- Insert Executive Brief sections
INSERT INTO format_sections (format_id, name, word_target, percentage_target, content_description, is_required, order_index) VALUES
  (2, 'Executive Summary', 250, 12.5, 'Vue d''ensemble stratégique pour décideurs', true, 1),
  (2, 'Context Analysis', 400, 20.0, 'Analyse du contexte marché, réglementaire, et concurrentiel', true, 2),
  (2, 'Key Findings', 500, 25.0, 'Résultats détaillés avec preuves', true, 3),
  (2, 'Strategic Implications', 350, 17.5, 'Implications stratégiques pour l''organisation', true, 4),
  (2, 'Recommendations', 350, 17.5, 'Recommandations actionnables avec timeline', true, 5),
  (2, 'Implementation Considerations', 150, 7.5, 'Facteurs critiques de succès', false, 6);

-- Insert Strategic Brief sections
INSERT INTO format_sections (format_id, name, word_target, percentage_target, content_description, is_required, order_index) VALUES
  (3, 'Executive Summary', 400, 8.0, 'Synthèse stratégique complète pour C-level', true, 1),
  (3, 'Strategic Context', 600, 12.0, 'Contexte macro-économique, réglementaire, et technologique', true, 2),
  (3, 'Comprehensive Analysis', 1200, 24.0, 'Analyse approfondie multi-dimensionnelle', true, 3),
  (3, 'Risk Assessment', 500, 10.0, 'Évaluation complète des risques', true, 4),
  (3, 'Implementation Roadmap', 800, 16.0, 'Feuille de route détaillée 12-24 mois', true, 5),
  (3, 'Strategic Recommendations', 800, 16.0, 'Recommandations stratégiques détaillées', true, 6),
  (3, 'ROI Analysis', 400, 8.0, 'Analyse retour sur investissement complet', true, 7),
  (3, 'Monitoring Framework', 300, 6.0, 'Cadre de monitoring et KPIs', true, 8);

-- Update existing publications
UPDATE publications 
SET format_id = (
  CASE 
    WHEN word_count <= 800 THEN 1  -- Summary Report
    WHEN word_count <= 2500 THEN 2  -- Executive Brief
    WHEN word_count > 2500 THEN 3  -- Strategic Brief
    ELSE NULL
  END
),
format_compliance = (
  CASE 
    WHEN word_count <= 800 AND word_count >= 550 THEN 'COMPLIANT'
    WHEN word_count <= 2500 AND word_count >= 1900 THEN 'COMPLIANT'
    WHEN word_count > 2500 AND word_count >= 4800 THEN 'COMPLIANT'
    ELSE 'NON_COMPLIANT'
  END
),
word_count_actual = word_count,
validation_errors = (
  CASE 
    WHEN word_count < 550 THEN '["Word count too low"]'
    WHEN word_count > 650 AND word_count <= 800 THEN '["Word count slightly high"]'
    WHEN word_count < 1900 AND word_count > 800 THEN '["Word count too low for tier"]'
    WHEN word_count > 2100 AND word_count <= 2500 THEN '["Word count slightly high for tier"]'
    WHEN word_count < 4800 AND word_count > 2500 THEN '["Word count too low for tier"]'
    WHEN word_count > 5200 THEN '["Word count too high"]'
    ELSE '[]'
  END
);
