-- Entfernt die offene Policy "Allow all access" aus der ersten Migration.
-- Sie erlaubte dem anon-Key Lesen, Schreiben und Löschen auf allen Tabellen.
-- Die Policies aus 20260309205411 (public read, authenticated write) bleiben bestehen.
-- Auf dem Live-Projekt ist die Policy bereits entfernt, daher ist IF EXISTS hier ein No-op.

DROP POLICY IF EXISTS "Allow all access" ON public.leagues;
DROP POLICY IF EXISTS "Allow all access" ON public.player_stats;
DROP POLICY IF EXISTS "Allow all access" ON public.training_sessions;
DROP POLICY IF EXISTS "Allow all access" ON public.training_players;
DROP POLICY IF EXISTS "Allow all access" ON public.matches;
DROP POLICY IF EXISTS "Allow all access" ON public.current_session;
