-- Player list administration (Umsetzungsplan 2, Punkt 3). The functions run with the rights of the caller
-- (SECURITY INVOKER), so the row level security of the tables applies: only signed-in users can change anything.
-- Additive: one index and two functions; no existing row is changed by this migration.
-- (The index is safe: there is no person with two rows in the same league. Check before applying, see the SQL tests.)

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

-- Merges player p_from into p_into.
--   p_leagues IS NULL      -> merge completely: all league rows, the opening balances, every evening and match, the
--                             other names; p_from is deleted and its name becomes another name of p_into.
--   p_leagues = {league,..} -> merge only the rows of these leagues (p_from must have a row in each of them). Evenings,
--                             matches, other names and p_from itself stay as they are. For people who made a mistake
--                             in one table only.
-- In a league where BOTH have a row, the rows are ADDED (all ten columns: wins, draws, losses, goals for/against,
-- points for/against, goal difference, championships, vice championships) and the row of p_from is deleted. Where only
-- p_from has a row, the row moves to p_into as it is. The opening balance of the league (league check) is added or
-- moved in the same way, so "opening balance + evenings = stored" keeps holding.
DROP FUNCTION IF EXISTS public.merge_players(uuid, uuid);
CREATE OR REPLACE FUNCTION public.merge_players(p_from uuid, p_into uuid, p_leagues uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_from_name text;
  v_into_name text;
  s player_stats%ROWTYPE;
  t player_stats%ROWTYPE;
  os league_opening_balances%ROWTYPE;
  ot league_opening_balances%ROWTYPE;
BEGIN
  IF p_from = p_into THEN RAISE EXCEPTION 'Ein Spieler kann nicht mit sich selbst zusammengeführt werden.'; END IF;
  SELECT display_name INTO v_from_name FROM players WHERE id = p_from FOR UPDATE;
  SELECT display_name INTO v_into_name FROM players WHERE id = p_into FOR UPDATE;
  IF v_from_name IS NULL OR v_into_name IS NULL THEN RAISE EXCEPTION 'Spieler nicht gefunden.'; END IF;

  IF p_leagues IS NOT NULL THEN
    IF cardinality(p_leagues) = 0 THEN RAISE EXCEPTION 'Keine Liga gewählt.'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_leagues) AS l(id)
               WHERE NOT EXISTS (SELECT 1 FROM player_stats WHERE league_id = l.id AND player_ref = p_from)) THEN
      RAISE EXCEPTION 'Der Spieler "%" hat in einer der gewählten Ligen keine Zeile.', v_from_name;
    END IF;
  ELSE
    -- complete merge: the name of p_from becomes another name of p_into, it must not belong to a third player already
    IF EXISTS (SELECT 1 FROM player_aliases WHERE alias = lower(btrim(v_from_name)) AND player_id NOT IN (p_from, p_into)) THEN
      RAISE EXCEPTION 'Der Name "%" ist schon ein anderer Name eines dritten Spielers.', v_from_name;
    END IF;
  END IF;

  -- league rows (and the opening balance of the same league)
  FOR s IN SELECT * FROM player_stats WHERE player_ref = p_from AND (p_leagues IS NULL OR league_id = ANY(p_leagues)) ORDER BY league_id, id LOOP
    SELECT * INTO t FROM player_stats WHERE league_id = s.league_id AND player_ref = p_into;
    IF FOUND THEN
      UPDATE player_stats SET
        wins = t.wins + s.wins, draws = t.draws + s.draws, losses = t.losses + s.losses,
        goals_for = t.goals_for + s.goals_for, goals_against = t.goals_against + s.goals_against,
        points = t.points + s.points, points_against = t.points_against + s.points_against,
        goal_difference = t.goal_difference + s.goal_difference,
        championships = t.championships + s.championships, vice_championships = t.vice_championships + s.vice_championships
      WHERE id = t.id;
      DELETE FROM player_stats WHERE id = s.id;
    ELSE
      UPDATE player_stats SET player_ref = p_into, player_name = v_into_name WHERE id = s.id;
    END IF;
  END LOOP;

  -- opening balances: of the selected leagues, or (complete merge) all of them, also those without a league row
  FOR os IN SELECT * FROM league_opening_balances WHERE player_ref = p_from AND (p_leagues IS NULL OR league_id = ANY(p_leagues)) ORDER BY league_id LOOP
    SELECT * INTO ot FROM league_opening_balances WHERE league_id = os.league_id AND player_ref = p_into;
    IF FOUND THEN
      UPDATE league_opening_balances SET
        wins = ot.wins + os.wins, draws = ot.draws + os.draws, losses = ot.losses + os.losses,
        goals_for = ot.goals_for + os.goals_for, goals_against = ot.goals_against + os.goals_against,
        points = ot.points + os.points, points_against = ot.points_against + os.points_against,
        goal_difference = ot.goal_difference + os.goal_difference,
        championships = ot.championships + os.championships, vice_championships = ot.vice_championships + os.vice_championships,
        updated_at = now()
      WHERE league_id = ot.league_id AND player_ref = p_into;
      DELETE FROM league_opening_balances WHERE league_id = os.league_id AND player_ref = p_from;
    ELSE
      UPDATE league_opening_balances SET player_ref = p_into, updated_at = now() WHERE league_id = os.league_id AND player_ref = p_from;
    END IF;
  END LOOP;

  IF p_leagues IS NULL THEN
    UPDATE training_players SET player_ref = p_into WHERE player_ref = p_from;
    UPDATE matches SET home_player_ref = p_into WHERE home_player_ref = p_from;
    UPDATE matches SET away_player_ref = p_into WHERE away_player_ref = p_from;
    UPDATE player_aliases SET player_id = p_into WHERE player_id = p_from;
    INSERT INTO player_aliases (alias, player_id) VALUES (lower(btrim(v_from_name)), p_into)
      ON CONFLICT (alias) DO UPDATE SET player_id = EXCLUDED.player_id;
    DELETE FROM players WHERE id = p_from;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.rename_player(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.merge_players(uuid, uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_player(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_players(uuid, uuid, uuid[]) TO authenticated, service_role;
