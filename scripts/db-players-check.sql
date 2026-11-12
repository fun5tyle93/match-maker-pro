-- Prüfung der Spieler-Zuordnung (Schritt D2). Nur lesend, enthält keine Namen. Jede Zeile: "prüfung | ergebnis".
-- Läuft live (Supabase MCP execute_sql) und an der Probe-Datenbank (psql).
SELECT line FROM (
  SELECT 1 AS o, 'spieler | ' || count(*) AS line FROM public.players
  UNION ALL SELECT 2, 'aliase | ' || count(*) FROM public.player_aliases
  UNION ALL SELECT 3, 'training_players ohne Referenz | ' || count(*) FROM public.training_players WHERE player_ref IS NULL
  UNION ALL SELECT 4, 'spiele mit leerer Heim-/Gast-Referenz (ohne Platzhalter) | ' || count(*) FROM public.matches
    WHERE (home_player_ref IS NULL AND home_player_name <> chr(8211)) OR (away_player_ref IS NULL AND away_player_name <> chr(8211))
  UNION ALL SELECT 5, 'player_stats ohne Referenz | ' || count(*) FROM public.player_stats WHERE player_ref IS NULL
  UNION ALL SELECT 6, 'player_stats ohne Referenz, Name in der Liga mehrfach | ' || count(*) FROM public.player_stats s WHERE s.player_ref IS NULL
    AND (SELECT count(*) FROM public.player_stats o WHERE o.league_id = s.league_id AND lower(btrim(o.player_name)) = lower(btrim(s.player_name))) > 1
  UNION ALL SELECT 7, 'Zeilen, deren Name nicht zum Spieler passt (ohne Alias) | ' || (
      (SELECT count(*) FROM public.training_players t JOIN public.players p ON p.id = t.player_ref
         WHERE lower(btrim(p.display_name)) <> lower(btrim(t.player_name)) AND NOT EXISTS (SELECT 1 FROM public.player_aliases a WHERE a.alias = lower(btrim(t.player_name))))
    + (SELECT count(*) FROM public.player_stats t JOIN public.players p ON p.id = t.player_ref
         WHERE lower(btrim(p.display_name)) <> lower(btrim(t.player_name)) AND NOT EXISTS (SELECT 1 FROM public.player_aliases a WHERE a.alias = lower(btrim(t.player_name))))
    + (SELECT count(*) FROM public.matches t JOIN public.players p ON p.id = t.home_player_ref
         WHERE lower(btrim(p.display_name)) <> lower(btrim(t.home_player_name)) AND NOT EXISTS (SELECT 1 FROM public.player_aliases a WHERE a.alias = lower(btrim(t.home_player_name))))
    + (SELECT count(*) FROM public.matches t JOIN public.players p ON p.id = t.away_player_ref
         WHERE lower(btrim(p.display_name)) <> lower(btrim(t.away_player_name)) AND NOT EXISTS (SELECT 1 FROM public.player_aliases a WHERE a.alias = lower(btrim(t.away_player_name)))))
  UNION ALL SELECT 8, 'Namen, die auf mehr als einen Spieler zeigen | ' || count(*) FROM (
      SELECT name FROM (
        SELECT player_name AS name, player_ref AS ref FROM public.training_players WHERE player_ref IS NOT NULL
        UNION ALL SELECT player_name, player_ref FROM public.player_stats WHERE player_ref IS NOT NULL
        UNION ALL SELECT home_player_name, home_player_ref FROM public.matches WHERE home_player_ref IS NOT NULL
        UNION ALL SELECT away_player_name, away_player_ref FROM public.matches WHERE away_player_ref IS NOT NULL) x
      GROUP BY name HAVING count(DISTINCT ref) > 1) y
  UNION ALL SELECT 9, 'Spieler ohne jede Zeile | ' || count(*) FROM public.players p WHERE NOT EXISTS (
      SELECT 1 FROM public.player_stats s WHERE s.player_ref = p.id UNION ALL SELECT 1 FROM public.training_players s WHERE s.player_ref = p.id
      UNION ALL SELECT 1 FROM public.matches m WHERE m.home_player_ref = p.id OR m.away_player_ref = p.id)
  UNION ALL SELECT 10, 'verschiedene Namen (Schreibweise egal) in den Daten | ' || count(DISTINCT lower(btrim(name))) FROM (
      SELECT player_name AS name FROM public.player_stats UNION ALL SELECT player_name FROM public.training_players
      UNION ALL SELECT home_player_name FROM public.matches WHERE home_player_name <> chr(8211)
      UNION ALL SELECT away_player_name FROM public.matches WHERE away_player_name <> chr(8211)) n
) q ORDER BY o;
