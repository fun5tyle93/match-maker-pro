-- Each evening keeps the ranking rule it was played under, so past winners never change silently.
-- Evenings that exist now were played under the old rule ('legacy'); new evenings get 'dtkv2026'
-- (DTKV Spielordnung 2026 § 8 Absatz 3).
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS ranking_rule text;
UPDATE public.training_sessions SET ranking_rule = 'legacy' WHERE ranking_rule IS NULL;   -- only the new column
ALTER TABLE public.training_sessions ALTER COLUMN ranking_rule SET DEFAULT 'dtkv2026';
ALTER TABLE public.training_sessions ALTER COLUMN ranking_rule SET NOT NULL;
ALTER TABLE public.training_sessions ADD CONSTRAINT training_sessions_ranking_rule_check CHECK (ranking_rule IN ('legacy', 'dtkv2026'));
-- Result of a decider (Entscheidungsspiel/-runde) for a complete tie at place 1 or 2: [{ "players": [id, ...], "order": [id, ...] }]
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS decider_results jsonb;
-- Playoff game decided by sudden death (Spielordnung § 9 Absatz 2); needed for the final ranking (§ 9 Absatz 6)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sudden_death boolean NOT NULL DEFAULT false;
