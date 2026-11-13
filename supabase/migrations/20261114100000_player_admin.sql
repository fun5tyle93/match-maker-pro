-- Player list administration (Umsetzungsplan 2, Punkt 3). The functions run with the rights of the caller
-- (SECURITY INVOKER), so the row level security of the tables applies: only signed-in users can change anything.
-- Additive: one index and two functions; no existing row is changed by this migration.

-- A person has at most one row per league (rows without an identity are not affected)
CREATE UNIQUE INDEX IF NOT EXISTS player_stats_league_player_ref_unique
  ON public.player_stats (league_id, player_ref) WHERE player_ref IS NOT NULL;

-- Renames a player. The old name stays as an alias, the league rows show the new name; names on evenings
-- and in matches stay as they were typed.
CREATE OR REPLACE FUNCTION public.rename_player(p_player uuid, p_new_name text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_old text;
  v_new text := btrim(regexp_replace(p_new_name, '\s+', ' ', 'g'));
BEGIN
  IF v_new = '' THEN RAISE EXCEPTION 'Der neue Name ist leer.'; END IF;
  SELECT display_name INTO v_old FROM players WHERE id = p_player FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Spieler nicht gefunden.'; END IF;
  IF v_old = v_new THEN RETURN; END IF;
  -- the new name must not already be another name of a different player
  IF EXISTS (SELECT 1 FROM player_aliases WHERE alias = lower(v_new) AND player_id <> p_player) THEN
    RAISE EXCEPTION 'Der Name ist schon ein anderer Name eines anderen Spielers.';
  END IF;
  UPDATE players SET display_name = v_new WHERE id = p_player;   -- the unique index rejects a name that is taken
  INSERT INTO player_aliases (alias, player_id) VALUES (lower(btrim(v_old)), p_player)
    ON CONFLICT (alias) DO NOTHING;
  DELETE FROM player_aliases WHERE alias = lower(v_new) AND player_id = p_player;  -- the new name is no alias of itself
  UPDATE player_stats SET player_name = v_new WHERE player_ref = p_player;
END $$;

-- Merges player p_from into p_into: every reference goes to p_into, the name of p_from becomes an alias of
-- p_into, p_from is deleted. Refused when both are in the same league (their rows would have to be added up;
-- that is a decision for a person, done by hand in the league first).
CREATE OR REPLACE FUNCTION public.merge_players(p_from uuid, p_into uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_from_name text;
  v_into_name text;
  v_league text;
BEGIN
  IF p_from = p_into THEN RAISE EXCEPTION 'Ein Spieler kann nicht mit sich selbst zusammengeführt werden.'; END IF;
  SELECT display_name INTO v_from_name FROM players WHERE id = p_from FOR UPDATE;
  SELECT display_name INTO v_into_name FROM players WHERE id = p_into FOR UPDATE;
  IF v_from_name IS NULL OR v_into_name IS NULL THEN RAISE EXCEPTION 'Spieler nicht gefunden.'; END IF;

  SELECT l.name INTO v_league FROM player_stats a JOIN player_stats b ON a.league_id = b.league_id
    JOIN leagues l ON l.id = a.league_id
    WHERE a.player_ref = p_from AND b.player_ref = p_into LIMIT 1;
  IF v_league IS NOT NULL THEN
    RAISE EXCEPTION 'Beide Spieler stehen in der Liga "%". Bitte dort zuerst eine der Zeilen bereinigen.', v_league;
  END IF;
  -- the name of p_from becomes an alias of p_into: it must not already be an alias of a third player
  IF EXISTS (SELECT 1 FROM player_aliases WHERE alias = lower(btrim(v_from_name)) AND player_id NOT IN (p_from, p_into)) THEN
    RAISE EXCEPTION 'Der Name "%" ist schon ein anderer Name eines dritten Spielers.', v_from_name;
  END IF;

  UPDATE training_players SET player_ref = p_into WHERE player_ref = p_from;
  UPDATE matches SET home_player_ref = p_into WHERE home_player_ref = p_from;
  UPDATE matches SET away_player_ref = p_into WHERE away_player_ref = p_from;
  UPDATE player_stats SET player_ref = p_into, player_name = v_into_name WHERE player_ref = p_from;
  UPDATE league_opening_balances SET player_ref = p_into WHERE player_ref = p_from;
  UPDATE player_aliases SET player_id = p_into WHERE player_id = p_from;
  INSERT INTO player_aliases (alias, player_id) VALUES (lower(btrim(v_from_name)), p_into)
    ON CONFLICT (alias) DO UPDATE SET player_id = EXCLUDED.player_id;
  DELETE FROM players WHERE id = p_from;
END $$;

REVOKE ALL ON FUNCTION public.rename_player(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.merge_players(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_player(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_players(uuid, uuid) TO authenticated, service_role;
