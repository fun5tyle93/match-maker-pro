-- Step E (reduced): the opening balance of every player in a league, i.e. what is in the league but does not come
-- from evenings of the app. The check "computed = stored" on the league page works out
--   opening balance + contributions of the transferred evenings
-- and compares it with player_stats. Nothing reads these rows to show a table; player_stats stays the truth.
-- Additive: new table only. Filled by the opening-balance script, see docs/UMSETZUNGSPLAN.md Schritt E.

CREATE TABLE IF NOT EXISTS public.league_opening_balances (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_ref uuid NOT NULL REFERENCES public.players(id),
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  goals_for integer NOT NULL DEFAULT 0,
  goals_against integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  points_against integer NOT NULL DEFAULT 0,
  goal_difference integer NOT NULL DEFAULT 0,
  championships integer NOT NULL DEFAULT 0,
  vice_championships integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, player_ref)
);
CREATE INDEX IF NOT EXISTS league_opening_balances_player_ref_idx ON public.league_opening_balances (player_ref);

ALTER TABLE public.league_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read league_opening_balances" ON public.league_opening_balances FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write league_opening_balances" ON public.league_opening_balances FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

REVOKE ALL ON public.league_opening_balances FROM anon;
GRANT SELECT ON public.league_opening_balances TO anon;
GRANT ALL ON public.league_opening_balances TO authenticated, service_role;
