-- Daten-Fingerabdruck: vor und nach jeder Migration ausführen und die Ausgaben vergleichen (diff).
-- Nur lesend. Läuft auf der Live-Datenbank (Supabase MCP execute_sql) und auf der Probe-Datenbank (psql).
-- Jede Zeile ist "bereich | schlüssel | werte". Eine Migration, die keine Daten ändern soll, muss eine identische Ausgabe erzeugen.
SELECT line FROM (
  SELECT 1 AS o, 'rows | ' || t || ' | ' || n AS line FROM (
    SELECT 'leagues' t, count(*) n FROM public.leagues UNION ALL
    SELECT 'player_stats', count(*) FROM public.player_stats UNION ALL
    SELECT 'training_sessions', count(*) FROM public.training_sessions UNION ALL
    SELECT 'training_players', count(*) FROM public.training_players UNION ALL
    SELECT 'matches', count(*) FROM public.matches UNION ALL
    SELECT 'current_session', count(*) FROM public.current_session) c
  UNION ALL
  SELECT 2, 'league | ' || l.name || ' | spieler=' || count(ps.id)
    || ' s=' || coalesce(sum(ps.wins),0) || '/' || coalesce(sum(ps.draws),0) || '/' || coalesce(sum(ps.losses),0)
    || ' tore=' || coalesce(sum(ps.goals_for),0) || ':' || coalesce(sum(ps.goals_against),0)
    || ' pkt=' || coalesce(sum(ps.points),0) || ':' || coalesce(sum(ps.points_against),0)
    || ' diff=' || coalesce(sum(ps.goal_difference),0)
    || ' m=' || coalesce(sum(ps.championships),0) || ' vm=' || coalesce(sum(ps.vice_championships),0)
    || ' namen=' || md5(coalesce(string_agg(ps.player_name || ':' || ps.points || ':' || ps.championships, ',' ORDER BY ps.player_name, ps.points), ''))
  FROM public.leagues l LEFT JOIN public.player_stats ps ON ps.league_id = l.id GROUP BY l.id, l.name
  UNION ALL
  SELECT 3, 'session | ' || s.date::date || ' ' || coalesce(s.name, '-') || ' | fertig=' || s.is_completed
    || ' typ=' || s.tournament_type || ' ligen=' || coalesce(array_length(s.transferred_to_leagues, 1), 0)
    || ' spieler=' || (SELECT count(*) FROM public.training_players p WHERE p.session_id = s.id)
    || ' spiele=' || (SELECT count(*) FROM public.matches m WHERE m.session_id = s.id)
    || ' gespielt=' || (SELECT count(*) FROM public.matches m WHERE m.session_id = s.id AND m.is_completed)
    || ' tore=' || (SELECT coalesce(sum(coalesce(m.home_score,0) + coalesce(m.away_score,0)), 0) FROM public.matches m WHERE m.session_id = s.id)
    || ' ergebnisse=' || (SELECT md5(coalesce(string_agg(m.home_player_name || '-' || m.away_player_name || '=' || coalesce(m.home_score::text,'') || ':' || coalesce(m.away_score::text,''), ',' ORDER BY m.round, m.home_player_name, m.away_player_name), '')) FROM public.matches m WHERE m.session_id = s.id)
  FROM public.training_sessions s
) x ORDER BY o, line;
