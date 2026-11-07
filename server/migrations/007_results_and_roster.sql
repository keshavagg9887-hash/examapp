-- Migration 007: Results release management and Expected Students Roster

-- 1. Add results release columns to exams table
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS results_released BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMPTZ;

-- 2. Add secure access_token to exam_participants for token-based result retrieval
ALTER TABLE public.exam_participants
  ADD COLUMN IF NOT EXISTS access_token TEXT;

-- Generate tokens for existing participants if missing
UPDATE public.exam_participants
SET access_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE access_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exam_participants_access_token_unique
  ON public.exam_participants (access_token)
  WHERE access_token IS NOT NULL;

-- 3. Expected students roster table to track attendance including absent students
CREATE TABLE IF NOT EXISTS public.exam_expected_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id BIGINT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  roll_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, roll_number)
);

CREATE INDEX IF NOT EXISTS exam_expected_students_exam_id_idx
  ON public.exam_expected_students (exam_id);
