-- Add GM-only character prompts while preserving existing character data.
-- Run in the Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gm_core_belief text,
  ADD COLUMN IF NOT EXISTS gm_regret text,
  ADD COLUMN IF NOT EXISTS gm_cherished_person text,
  ADD COLUMN IF NOT EXISTS gm_desire text,
  ADD COLUMN IF NOT EXISTS gm_fear text,
  ADD COLUMN IF NOT EXISTS gm_unknown_secret text,
  ADD COLUMN IF NOT EXISTS gm_backstory_hooks text;

NOTIFY pgrst, 'reload schema';
