-- Step D2: fills players and the player_ref columns from the names that are stored today. Idempotent: running it
-- again changes nothing. Only the new columns are written; no name, id, score or point changes.
--
-- Names that are the same player under another spelling are decided by a person beforehand and stored in
-- player_aliases (alias = lower(btrim(name))); such a name belongs to the alias's player and gets no player of its own.
-- A name that appears more than once in the same league (a duplicate row to be corrected by hand) gets no reference
-- in that league until the duplicate is resolved.

-- 1. One player per spelling, ignoring case and surrounding spaces. The most frequent spelling is the display name.
WITH names AS (
  SELECT player_name AS name FROM public.player_stats
  UNION ALL SELECT player_name FROM public.training_players
  UNION ALL SELECT home_player_name FROM public.matches WHERE home_player_name <> chr(8211)  -- placeholder of an empty slot
  UNION ALL SELECT away_player_name FROM public.matches WHERE away_player_name <> chr(8211)
), counted AS (
  SELECT lower(btrim(name)) AS key, btrim(name) AS name, count(*) AS n
  FROM names WHERE btrim(name) <> '' GROUP BY 1, 2
), chosen AS (
  SELECT DISTINCT ON (key) key, name FROM counted ORDER BY key, n DESC, name
)
INSERT INTO public.players (display_name)
SELECT c.name FROM chosen c
WHERE NOT EXISTS (SELECT 1 FROM public.player_aliases a WHERE a.alias = c.key)
ON CONFLICT DO NOTHING;

-- 2. References: via alias first, then via the player with the same spelling
UPDATE public.training_players t
SET player_ref = COALESCE(
  (SELECT a.player_id FROM public.player_aliases a WHERE a.alias = lower(btrim(t.player_name))),
  (SELECT p.id FROM public.players p WHERE lower(btrim(p.display_name)) = lower(btrim(t.player_name))))
WHERE t.player_ref IS NULL;

UPDATE public.matches m
SET home_player_ref = COALESCE(
  (SELECT a.player_id FROM public.player_aliases a WHERE a.alias = lower(btrim(m.home_player_name))),
  (SELECT p.id FROM public.players p WHERE lower(btrim(p.display_name)) = lower(btrim(m.home_player_name))))
WHERE m.home_player_ref IS NULL;

UPDATE public.matches m
SET away_player_ref = COALESCE(
  (SELECT a.player_id FROM public.player_aliases a WHERE a.alias = lower(btrim(m.away_player_name))),
  (SELECT p.id FROM public.players p WHERE lower(btrim(p.display_name)) = lower(btrim(m.away_player_name))))
WHERE m.away_player_ref IS NULL;

UPDATE public.player_stats s
SET player_ref = COALESCE(
  (SELECT a.player_id FROM public.player_aliases a WHERE a.alias = lower(btrim(s.player_name))),
  (SELECT p.id FROM public.players p WHERE lower(btrim(p.display_name)) = lower(btrim(s.player_name))))
WHERE s.player_ref IS NULL
  AND (SELECT count(*) FROM public.player_stats o
       WHERE o.league_id = s.league_id AND lower(btrim(o.player_name)) = lower(btrim(s.player_name))) = 1;
