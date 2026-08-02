ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'swiss',
  ADD COLUMN IF NOT EXISTS playoff_round integer,
  ADD COLUMN IF NOT EXISTS match_number integer,
  ADD COLUMN IF NOT EXISTS is_bye boolean NOT NULL DEFAULT false;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS tournament_type text NOT NULL DEFAULT 'training';