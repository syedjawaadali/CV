-- =============================================================================
-- Smart Dukaan — Recognition / OCR metadata (migration 0007)  [ADDITIVE ONLY]
--
-- Extends the Phase 2 recognition_observations with on-device OCR evidence and
-- the deterministic decision outcome, and lets candidates carry contradictions.
-- No existing data is changed; every column is nullable/defaulted.
-- =============================================================================

ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS ocr_full_text TEXT;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS ocr_provider TEXT;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS ocr_provider_version TEXT;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS processing_ms INTEGER;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS image_quality TEXT;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS extracted_attributes JSONB;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS confidence_category TEXT
  CHECK (confidence_category IN ('exact','high','medium','low','conflict') OR confidence_category IS NULL);
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS recommended_action TEXT;
ALTER TABLE recognition_observations ADD COLUMN IF NOT EXISTS offline BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE recognition_candidates ADD COLUMN IF NOT EXISTS contradictions JSONB;
ALTER TABLE recognition_candidates ADD COLUMN IF NOT EXISTS confidence_category TEXT;
ALTER TABLE recognition_candidates ADD COLUMN IF NOT EXISTS display_name TEXT;
