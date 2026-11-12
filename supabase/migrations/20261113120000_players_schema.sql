-- Step D1: fixed player identity, schema only (additive). Nothing is filled and no existing row changes.
-- The name columns (player_name, home_player_name, ...) stay and are still written: they are the readable copy
-- and the way back. The references are filled in step D2 and used by the app in step D3.

CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One player per spelling, ignoring case and surrounding spaces
CREATE UNIQUE INDEX IF NOT EXISTS players_display_name_unique ON public.players (lower(btrim(display_name)));

-- Other spellings of a player's name (alias is always lower(btrim(name)))
CREATE TABLE IF NOT EXISTS public.player_aliases (
  alias text PRIMARY KEY CHECK (alias = lower(btrim(alias)) AND alias <> ''),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS player_aliases_player_id_idx ON public.player_aliases (player_id);

ALTER TABLE public.training_players ADD COLUMN IF NOT EXISTS player_ref uuid REFERENCES public.players(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_player_ref uuid REFERENCES public.players(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_player_ref uuid REFERENCES public.players(id);
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS player_ref uuid REFERENCES public.players(id);

CREATE INDEX IF NOT EXISTS training_players_player_ref_idx ON public.training_players (player_ref);
CREATE INDEX IF NOT EXISTS matches_home_player_ref_idx ON public.matches (home_player_ref);
CREATE INDEX IF NOT EXISTS matches_away_player_ref_idx ON public.matches (away_player_ref);
CREATE INDEX IF NOT EXISTS player_stats_player_ref_idx ON public.player_stats (player_ref);

-- Same access rules as all other tables: everybody reads, only signed-in users write
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read players" ON public.players FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write players" ON public.players FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Public read player_aliases" ON public.player_aliases FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write player_aliases" ON public.player_aliases FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Defence in depth: the anonymous role may only read these tables (the policies above say the same)
REVOKE ALL ON public.players, public.player_aliases FROM anon;
GRANT SELECT ON public.players, public.player_aliases TO anon;
GRANT ALL ON public.players, public.player_aliases TO authenticated, service_role;
