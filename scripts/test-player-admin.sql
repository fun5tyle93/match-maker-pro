-- Tests der Spielerlisten-Funktionen (supabase/migrations/20261114100000_player_admin.sql) an der Probe-Datenbank.
--   scripts/db-rehearsal.sh <backup-ordner> supabase/migrations/20261114100000_player_admin.sql   (Probe aufbauen)
--   psql -h /var/tmp/mm-pg -p 54329 -U postgres -v ON_ERROR_STOP=1 -f scripts/test-player-admin.sql
-- Läuft in einer Transaktion und rollt am Ende zurück: die Probe bleibt unverändert. Jeder Fall bricht mit einer
-- Meldung ab, wenn er fehlschlägt; am Ende steht "ALLE FAELLE OK". Die Testdaten kommen mit erfundenen Namen dazu.
BEGIN;

-- Supabase gibt angemeldeten Nutzern Standardrechte auf allen Tabellen (die Zeilen schützt die Row-Level-Security); die
-- lokale Probe kennt das nicht. Wird mit dem ROLLBACK am Ende zurückgenommen.
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE TEMP TABLE t_result (name text);
-- erwartet, dass der Aufruf mit diesem SQLSTATE-Code (oder Text in der Meldung) scheitert
CREATE FUNCTION pg_temp.expect_error(p_sql text, p_code text, p_text text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_code IS NOT NULL AND SQLSTATE <> p_code THEN RAISE EXCEPTION 'falscher Fehlercode % (erwartet %): %', SQLSTATE, p_code, SQLERRM; END IF;
    IF p_text IS NOT NULL AND position(p_text in SQLERRM) = 0 THEN RAISE EXCEPTION 'falsche Meldung: % (erwartet Teil: %)', SQLERRM, p_text; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'es wurde ein Fehler erwartet, aber keiner ausgelöst: %', p_sql;
END $$;
-- Zustand der Daten (Zeilenzahlen und Inhalte); gleich = nichts verändert
CREATE FUNCTION pg_temp.snapshot() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM players) || '/' || (SELECT count(*) FROM player_aliases) || '/' || (SELECT count(*) FROM player_stats)
      || '/' || (SELECT count(*) FROM training_players) || '/' || (SELECT count(*) FROM matches)
      || '/' || (SELECT count(*) FROM league_opening_balances)
      || '/' || (SELECT md5(string_agg(coalesce(player_ref::text,'-')||player_name||points||wins, ',' ORDER BY id)) FROM player_stats)
      || '/' || (SELECT md5(string_agg(coalesce(player_ref::text,'-'), ',' ORDER BY id)) FROM training_players)
      || '/' || (SELECT md5(string_agg(coalesce(home_player_ref::text,'-')||coalesce(away_player_ref::text,'-'), ',' ORDER BY id)) FROM matches)
$$;
-- Summe jeder der zehn Spalten über ALLE Liga-Zeilen und über ALLE Startbestände: ein Zusammenführen verschiebt oder
-- addiert nur, deshalb müssen diese Summen davor und danach gleich sein ("es geht nichts verloren")
CREATE FUNCTION pg_temp.sums() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT concat_ws(',', sum(wins), sum(draws), sum(losses), sum(goals_for), sum(goals_against), sum(points), sum(points_against),
                                sum(goal_difference), sum(championships), sum(vice_championships)) FROM player_stats)
      || ' | ' ||
         (SELECT concat_ws(',', sum(wins), sum(draws), sum(losses), sum(goals_for), sum(goals_against), sum(points), sum(points_against),
                                sum(goal_difference), sum(championships), sum(vice_championships)) FROM league_opening_balances)
$$;
-- eine Liga-Zeile der Testdaten: Liga über ihre Reihenfolge (0, 1, 2), danach die zehn Spalten
CREATE FUNCTION pg_temp.add_row(p_league int, p_player uuid, p_name text, w int, d int, l int, gf int, ga int, pts int, pa int, gd int, ch int, vi int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO player_stats (league_id, player_name, player_ref, wins, draws, losses, goals_for, goals_against, points, points_against, goal_difference, championships, vice_championships)
  SELECT id, p_name, p_player, w, d, l, gf, ga, pts, pa, gd, ch, vi FROM leagues ORDER BY name OFFSET p_league LIMIT 1
$$;
CREATE FUNCTION pg_temp.add_opening(p_league int, p_player uuid, w int, d int, l int, gf int, ga int, pts int, pa int, gd int, ch int, vi int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO league_opening_balances (league_id, player_ref, wins, draws, losses, goals_for, goals_against, points, points_against, goal_difference, championships, vice_championships)
  SELECT id, p_player, w, d, l, gf, ga, pts, pa, gd, ch, vi FROM leagues ORDER BY name OFFSET p_league LIMIT 1
$$;
-- die zehn Spalten einer Zeile (Liga über ihre Reihenfolge, Spieler) als Text
CREATE FUNCTION pg_temp.row_of(p_league int, p_player uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(',', wins, draws, losses, goals_for, goals_against, points, points_against, goal_difference, championships, vice_championships)
  FROM player_stats WHERE player_ref = p_player AND league_id = (SELECT id FROM leagues ORDER BY name OFFSET p_league LIMIT 1)
$$;
CREATE FUNCTION pg_temp.opening_of(p_league int, p_player uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(',', wins, draws, losses, goals_for, goals_against, points, points_against, goal_difference, championships, vice_championships)
  FROM league_opening_balances WHERE player_ref = p_player AND league_id = (SELECT id FROM leagues ORDER BY name OFFSET p_league LIMIT 1)
$$;
CREATE FUNCTION pg_temp.league_id(p_league int) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM leagues ORDER BY name OFFSET p_league LIMIT 1 $$;

-- ── Testdaten (erfundene Namen). Anna und Anni sind dieselbe Person, Cem und Dora ebenso; Ben ist eine andere ──
INSERT INTO players (id, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Test Anna'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test Anni'),
  ('00000000-0000-4000-8000-0000000000b1', 'Test Ben'),
  ('00000000-0000-4000-8000-0000000000c1', 'Test Cem'),
  ('00000000-0000-4000-8000-0000000000d3', 'Test Dora');
INSERT INTO player_aliases (alias, player_id) VALUES ('anni alt', '00000000-0000-4000-8000-0000000000a2');

-- Liga 0 (Anna UND Anni: werden addiert), Liga 1 (nur Anni: Zeile wandert), Liga 2 (nur ein Startbestand von Anni)
-- Jede der zehn Spalten hat bei jedem Eintrag einen anderen Wert, damit eine vertauschte oder vergessene Spalte auffällt
SELECT pg_temp.add_row(0, '00000000-0000-4000-8000-0000000000a1', 'Test Anna',   3, 2, 1, 11,  7,  8,  4,  4, 2, 1);
SELECT pg_temp.add_row(0, '00000000-0000-4000-8000-0000000000a2', 'Test Anni',   5, 1, 4, 20, 13, 11,  9,  7, 1, 3);
SELECT pg_temp.add_row(1, '00000000-0000-4000-8000-0000000000a2', 'Test Anni',   7, 6, 5, 40, 33, 20, 16,  7, 4, 2);
SELECT pg_temp.add_opening(0, '00000000-0000-4000-8000-0000000000a1', 1, 1, 1, 2, 3, 4, 5, -1, 6, 7);
SELECT pg_temp.add_opening(0, '00000000-0000-4000-8000-0000000000a2', 2, 3, 4, 5, 6, 7, 8, 9, 1, 2);
SELECT pg_temp.add_opening(1, '00000000-0000-4000-8000-0000000000a2', 9, 8, 7, 6, 5, 4, 3, -2, 1, 0);
SELECT pg_temp.add_opening(2, '00000000-0000-4000-8000-0000000000a2', 0, 0, 0, 0, 0, -6, 0, 0, 0, 0);   -- Startbestand ohne Liga-Zeile
-- Abend und Partien (Anni als Gast und als Heimspielerin, Anna als Heimspielerin)
INSERT INTO training_players (session_id, player_id, player_name, player_ref)
  SELECT id, '00000000-0000-4000-8000-0000000000e1', 'Test Anna', '00000000-0000-4000-8000-0000000000a1' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO training_players (session_id, player_id, player_name, player_ref)
  SELECT id, '00000000-0000-4000-8000-0000000000e3', 'Test Anni', '00000000-0000-4000-8000-0000000000a2' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO matches (session_id, round, home_player_id, home_player_name, home_player_ref, away_player_id, away_player_name, away_player_ref)
  SELECT id, 99, '00000000-0000-4000-8000-0000000000e1', 'Test Anna', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e2', 'Test Ben', '00000000-0000-4000-8000-0000000000b1' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO matches (session_id, round, home_player_id, home_player_name, home_player_ref, away_player_id, away_player_name, away_player_ref)
  SELECT id, 98, '00000000-0000-4000-8000-0000000000e2', 'Test Ben', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e3', 'Test Anni', '00000000-0000-4000-8000-0000000000a2' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO matches (session_id, round, home_player_id, home_player_name, home_player_ref, away_player_id, away_player_name, away_player_ref)
  SELECT id, 97, '00000000-0000-4000-8000-0000000000e3', 'Test Anni', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2', 'Test Ben', '00000000-0000-4000-8000-0000000000b1' FROM training_sessions ORDER BY id LIMIT 1;
-- Ben steht in Liga 0 und 1 (für die Fälle "Fehler")
SELECT pg_temp.add_row(0, '00000000-0000-4000-8000-0000000000b1', 'Test Ben', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
SELECT pg_temp.add_row(1, '00000000-0000-4000-8000-0000000000b1', 'Test Ben', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
-- Cem (Liga 0) und Dora (Liga 0 und 1, ein Abend) für das Zusammenführen nur in bestimmten Ligen
SELECT pg_temp.add_row(0, '00000000-0000-4000-8000-0000000000c1', 'Test Cem',    2, 2, 2,  8,  8,  6,  6,  0, 1, 1);
SELECT pg_temp.add_row(0, '00000000-0000-4000-8000-0000000000d3', 'Test Dora',  10, 9, 8, 70, 60, 29, 25, 10, 3, 2);
SELECT pg_temp.add_row(1, '00000000-0000-4000-8000-0000000000d3', 'Test Dora',  12, 11, 13, 80, 90, 35, 37, -10, 5, 4);
SELECT pg_temp.add_opening(1, '00000000-0000-4000-8000-0000000000d3', 3, 3, 3, 3, 3, 3, 3, 3, 3, 3);
INSERT INTO training_players (session_id, player_id, player_name, player_ref)
  SELECT id, '00000000-0000-4000-8000-0000000000e4', 'Test Dora', '00000000-0000-4000-8000-0000000000d3' FROM training_sessions ORDER BY id LIMIT 1;

-- ── Fall 1: Umbenennen ──
DO $$
BEGIN
  PERFORM rename_player('00000000-0000-4000-8000-0000000000b1', '  Test   Benno ');
  ASSERT (SELECT display_name FROM players WHERE id = '00000000-0000-4000-8000-0000000000b1') = 'Test Benno', 'Name nicht gesetzt oder Leerzeichen nicht bereinigt';
  ASSERT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test ben' AND player_id = '00000000-0000-4000-8000-0000000000b1'), 'alter Name ist kein Alias';
  ASSERT (SELECT count(*) FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000b1' AND player_name = 'Test Benno') = 2, 'Liga-Zeilen zeigen nicht den neuen Namen';
  ASSERT (SELECT count(*) FROM matches WHERE home_player_name = 'Test Ben' OR away_player_name = 'Test Ben') >= 2, 'Namen in Partien dürfen sich nicht ändern';
  ASSERT (SELECT player_name FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e1') = 'Test Anna', 'Namen am Abend dürfen sich nicht ändern';
  PERFORM rename_player('00000000-0000-4000-8000-0000000000b1', 'Test Benno');   -- gleicher Name: nichts passiert
  PERFORM rename_player('00000000-0000-4000-8000-0000000000b1', 'Test Ben');     -- zurück: der eigene Name ist kein Alias seiner selbst
  ASSERT NOT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test ben'), 'der eigene Name steht als Alias';
  ASSERT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test benno'), 'der zwischenzeitliche Name ist kein Alias';
END $$;
INSERT INTO t_result VALUES ('1 Umbenennen');

-- ── Fall 2: Umbenennen abgelehnt ──
DO $$
DECLARE v text := pg_temp.snapshot();
BEGIN
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000c1', '  test   ANNA')$q$, '23505');
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000c1', 'Anni Alt')$q$, NULL, 'anderer Name eines anderen Spielers');
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000c1', '   ')$q$, NULL, 'leer');
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000ff', 'Irgendwer')$q$, NULL, 'nicht gefunden');
  ASSERT pg_temp.snapshot() = v, 'trotz Ablehnung wurde etwas verändert';
END $$;
INSERT INTO t_result VALUES ('2 Umbenennen auf vergebenen Namen oder Alias, leeren Namen, unbekannten Spieler');

-- ── Fall 3: Fehler beim Zusammenführen, nichts verändert ──
DO $$
DECLARE v text := pg_temp.snapshot(); s text := pg_temp.sums();
BEGIN
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1')$q$, NULL, 'mit sich selbst');
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000ff')$q$, NULL, 'nicht gefunden');
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', ARRAY[]::uuid[])$q$, NULL, 'Keine Liga gewählt');
  -- Liga 2: Anni hat dort nur einen Startbestand, keine Zeile
  PERFORM pg_temp.expect_error(format($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', ARRAY['%s']::uuid[])$q$, pg_temp.league_id(2)), NULL, 'keine Zeile');
  -- Anna hat in Liga 1 keine Zeile: Ben -> Anna nur in Liga 1 geht nicht umgekehrt; Anna -> Ben in Liga 1 hat keine Quellzeile
  PERFORM pg_temp.expect_error(format($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', ARRAY['%s']::uuid[])$q$, pg_temp.league_id(1)), NULL, 'keine Zeile');
  -- der Name des Quellspielers darf bei vollständigem Zusammenführen nicht schon ein Alias eines Dritten sein
  INSERT INTO players (id, display_name) VALUES ('00000000-0000-4000-8000-0000000000e5', 'Test E'), ('00000000-0000-4000-8000-0000000000f5', 'Test F'), ('00000000-0000-4000-8000-0000000000dd', 'Test Dritter');
  INSERT INTO player_aliases (alias, player_id) VALUES ('test e', '00000000-0000-4000-8000-0000000000dd');
  v := pg_temp.snapshot();
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000f5')$q$, NULL, 'dritten Spielers');
  ASSERT pg_temp.snapshot() = v, 'trotz Ablehnung wurde etwas verändert';
  DELETE FROM player_aliases WHERE alias = 'test e';
  DELETE FROM players WHERE id IN ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000dd');
  ASSERT pg_temp.sums() = s, 'Summen haben sich verändert';
END $$;
INSERT INTO t_result VALUES ('3 Zusammenführen abgelehnt: sich selbst, unbekannt, keine Liga, Liga ohne Zeile, Alias eines Dritten; nichts verändert');

-- ── Fall 4: ganz zusammenführen (Anni -> Anna): Zeilen derselben Liga werden ADDIERT, alle zehn Spalten ──
DO $$
DECLARE
  v_sums text := pg_temp.sums();
  v_stats_rows int := (SELECT count(*) FROM player_stats);
  v_open_rows int := (SELECT count(*) FROM league_opening_balances);
  v_anni_l1 text := pg_temp.row_of(1, '00000000-0000-4000-8000-0000000000a2');
BEGIN
  PERFORM merge_players('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1');   -- NULL = ganz
  -- Liga 0: Anna (3,2,1,11,7,8,4,4,2,1) + Anni (5,1,4,20,13,11,9,7,1,3), jede Spalte einzeln
  ASSERT pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000a1') = '8,3,5,31,20,19,13,11,3,4', 'Zeilen in derselben Liga nicht über alle zehn Spalten addiert: ' || pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000a1');
  -- Liga 1: nur Anni hatte eine Zeile: sie wandert unverändert zu Anna und zeigt ihren Namen
  ASSERT pg_temp.row_of(1, '00000000-0000-4000-8000-0000000000a1') = v_anni_l1, 'Zeile ohne Gegenstück nicht unverändert übernommen';
  ASSERT (SELECT player_name FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000a1' AND league_id = pg_temp.league_id(1)) = 'Test Anna', 'Liga-Zeile zeigt nicht den Namen des Ziels';
  ASSERT (SELECT count(*) FROM player_stats) = v_stats_rows - 1, 'es muss genau eine Zeile weniger geben (die addierte)';
  -- Startbestand: Liga 0 addiert, Liga 1 und Liga 2 (ohne Liga-Zeile) übernommen
  ASSERT pg_temp.opening_of(0, '00000000-0000-4000-8000-0000000000a1') = '3,4,5,7,9,11,13,8,7,9', 'Startbestand in Liga 0 nicht addiert: ' || pg_temp.opening_of(0, '00000000-0000-4000-8000-0000000000a1');
  ASSERT pg_temp.opening_of(1, '00000000-0000-4000-8000-0000000000a1') = '9,8,7,6,5,4,3,-2,1,0', 'Startbestand in Liga 1 nicht übernommen';
  ASSERT pg_temp.opening_of(2, '00000000-0000-4000-8000-0000000000a1') = '0,0,0,0,0,-6,0,0,0,0', 'Startbestand ohne Liga-Zeile nicht übernommen';
  ASSERT (SELECT count(*) FROM league_opening_balances) = v_open_rows - 1, 'es muss genau einen Startbestand weniger geben';
  -- die wichtigste Eigenschaft: nichts geht verloren, nichts kommt dazu
  ASSERT pg_temp.sums() = v_sums, 'die Summen über alle Zeilen haben sich verändert: vorher ' || v_sums || ', nachher ' || pg_temp.sums();
  -- Spieler, Abende, Partien, andere Namen
  ASSERT NOT EXISTS (SELECT 1 FROM players WHERE id = '00000000-0000-4000-8000-0000000000a2'), 'die Quelle wurde nicht gelöscht';
  ASSERT (SELECT player_ref FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e3') = '00000000-0000-4000-8000-0000000000a1', 'Abend nicht umgehängt';
  ASSERT (SELECT away_player_ref FROM matches WHERE round = 98) = '00000000-0000-4000-8000-0000000000a1', 'Gast-Verweis nicht umgehängt';
  ASSERT (SELECT home_player_ref FROM matches WHERE round = 97) = '00000000-0000-4000-8000-0000000000a1', 'Heim-Verweis nicht umgehängt';
  ASSERT (SELECT player_id FROM player_aliases WHERE alias = 'anni alt') = '00000000-0000-4000-8000-0000000000a1', 'alter Alias zeigt nicht auf das Ziel';
  ASSERT (SELECT player_id FROM player_aliases WHERE alias = 'test anni') = '00000000-0000-4000-8000-0000000000a1', 'Name der Quelle ist kein Alias des Ziels';
  ASSERT (SELECT player_name FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e3') = 'Test Anni', 'Name am Abend geändert';
END $$;
INSERT INTO t_result VALUES ('4 Ganz zusammenführen: alle zehn Spalten addiert, Zeilen ohne Gegenstück übernommen, Startbestände ebenso, Summen unverändert');

-- ── Fall 5: nur in bestimmten Ligen (Dora -> Cem): erst Liga 1 (nur Dora hat dort eine Zeile), dann Liga 0 (beide) ──
DO $$
DECLARE
  v_sums text := pg_temp.sums();
  v_dora_l0 text := pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000d3');
  v_dora_l1 text := pg_temp.row_of(1, '00000000-0000-4000-8000-0000000000d3');
  v_cem_l0 text := pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000c1');
  v_aliases int := (SELECT count(*) FROM player_aliases);
BEGIN
  PERFORM merge_players('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', ARRAY[pg_temp.league_id(1)]);
  ASSERT pg_temp.row_of(1, '00000000-0000-4000-8000-0000000000c1') = v_dora_l1, 'Zeile aus Liga 1 nicht bei Cem';
  ASSERT pg_temp.row_of(1, '00000000-0000-4000-8000-0000000000d3') IS NULL, 'Dora hat in Liga 1 noch eine Zeile';
  ASSERT (SELECT player_name FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000c1' AND league_id = pg_temp.league_id(1)) = 'Test Cem', 'Zeile zeigt nicht den Namen von Cem';
  ASSERT pg_temp.opening_of(1, '00000000-0000-4000-8000-0000000000c1') = '3,3,3,3,3,3,3,3,3,3', 'Startbestand der Liga nicht mitgenommen';
  -- Liga 0 bleibt, wie sie war; Dora gibt es noch, ihr Abend bleibt bei ihr, es gibt keinen neuen anderen Namen
  ASSERT pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000d3') = v_dora_l0, 'Doras Zeile in Liga 0 wurde angefasst';
  ASSERT pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000c1') = v_cem_l0, 'Cems Zeile in Liga 0 wurde angefasst';
  ASSERT EXISTS (SELECT 1 FROM players WHERE id = '00000000-0000-4000-8000-0000000000d3'), 'Dora wurde gelöscht, obwohl nur eine Liga gewählt war';
  ASSERT (SELECT player_ref FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e4') = '00000000-0000-4000-8000-0000000000d3', 'der Abend von Dora wurde umgehängt';
  ASSERT (SELECT count(*) FROM player_aliases) = v_aliases, 'es wurden andere Namen angelegt';
  ASSERT pg_temp.sums() = v_sums, 'Summen verändert nach dem Zusammenführen in Liga 1';
  -- jetzt auch Liga 0, wo beide eine Zeile haben: addiert, alle zehn Spalten (Cem 2,2,2,8,8,6,6,0,1,1 + Dora 10,9,8,70,60,29,25,10,3,2)
  PERFORM merge_players('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', ARRAY[pg_temp.league_id(0)]);
  ASSERT pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000c1') = '12,11,10,78,68,35,31,10,4,3', 'Zeilen nicht über alle zehn Spalten addiert: ' || pg_temp.row_of(0, '00000000-0000-4000-8000-0000000000c1');
  ASSERT NOT EXISTS (SELECT 1 FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000d3'), 'Dora hat noch Zeilen';
  ASSERT EXISTS (SELECT 1 FROM players WHERE id = '00000000-0000-4000-8000-0000000000d3'), 'Dora wurde bei einem Zusammenführen nur der Zeilen gelöscht';
  ASSERT pg_temp.sums() = v_sums, 'Summen verändert nach dem Zusammenführen in Liga 0';
  -- eine Liga, in der die Quelle keine Zeile mehr hat, wird abgelehnt
  PERFORM pg_temp.expect_error(format($q$SELECT merge_players('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', ARRAY['%s']::uuid[])$q$, pg_temp.league_id(0)), NULL, 'keine Zeile');
END $$;
INSERT INTO t_result VALUES ('5 Nur in bestimmten Ligen: Zeilen und Startbestände dieser Ligen, Spieler, Abende und Namen bleiben, Summen unverändert');

-- ── Fall 6: Löschen ──
DO $$
BEGIN
  PERFORM pg_temp.expect_error($q$DELETE FROM players WHERE id = '00000000-0000-4000-8000-0000000000a1'$q$, '23503');   -- kommt noch vor
  PERFORM pg_temp.expect_error($q$DELETE FROM players WHERE id = '00000000-0000-4000-8000-0000000000d3'$q$, '23503');   -- hat noch einen Abend
  INSERT INTO players (id, display_name) VALUES ('00000000-0000-4000-8000-0000000000d2', 'Test Unbenutzt');
  DELETE FROM players WHERE id = '00000000-0000-4000-8000-0000000000d2';                                                    -- kommt nirgends vor
  ASSERT NOT EXISTS (SELECT 1 FROM players WHERE id = '00000000-0000-4000-8000-0000000000d2');
END $$;
INSERT INTO t_result VALUES ('6 Löschen nur eines unbenutzten Spielers');

-- ── Fall 7: zweite Zeile desselben Spielers in derselben Liga ──
DO $$
BEGIN
  PERFORM pg_temp.expect_error($q$INSERT INTO player_stats (league_id, player_name, player_ref)
    SELECT league_id, 'Test Anna doppelt', player_ref FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000a1' LIMIT 1$q$, '23505');
  INSERT INTO player_stats (league_id, player_name) SELECT id, 'Ohne Identität' FROM leagues LIMIT 1;   -- zwei Zeilen ohne Identität sind erlaubt
  INSERT INTO player_stats (league_id, player_name) SELECT id, 'Ohne Identität' FROM leagues LIMIT 1;
END $$;
INSERT INTO t_result VALUES ('7 Eindeutigkeit je Liga gilt nur für Zeilen mit Identität');

-- ── Fall 8: Rechte ──
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.rename_player(uuid,text)', 'EXECUTE'), 'anon darf rename_player ausführen';
  ASSERT NOT has_function_privilege('anon', 'public.merge_players(uuid,uuid,uuid[])', 'EXECUTE'), 'anon darf merge_players ausführen';
  ASSERT has_function_privilege('authenticated', 'public.rename_player(uuid,text)', 'EXECUTE'), 'authenticated darf rename_player nicht ausführen';
  ASSERT has_function_privilege('authenticated', 'public.merge_players(uuid,uuid,uuid[])', 'EXECUTE'), 'authenticated darf merge_players nicht ausführen';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merge_players' AND pronargs = 2), 'die alte Funktion mit zwei Argumenten gibt es noch';
END $$;
SAVEPOINT rechte;
SET LOCAL ROLE anon;
DO $$ BEGIN PERFORM pg_temp.expect_error($q$SELECT public.rename_player('00000000-0000-4000-8000-0000000000c1', 'Hacker')$q$, '42501'); END $$;
DO $$ BEGIN PERFORM pg_temp.expect_error($q$SELECT public.merge_players('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1')$q$, '42501'); END $$;
RESET ROLE;
ROLLBACK TO rechte;
-- Ein Token mit falscher Rolle sieht die Spieler nicht (Row-Level-Security gilt, die Funktionen laufen mit den Rechten des Aufrufers)
SAVEPOINT falsche_rolle;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'anon';
DO $$ BEGIN PERFORM pg_temp.expect_error($q$SELECT public.rename_player('00000000-0000-4000-8000-0000000000c1', 'Hacker')$q$, NULL, 'nicht gefunden'); END $$;
RESET ROLE;
ROLLBACK TO falsche_rolle;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.rename_player('00000000-0000-4000-8000-0000000000c1', 'Test Cem Neu');
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT display_name FROM players WHERE id = '00000000-0000-4000-8000-0000000000c1') = 'Test Cem Neu', 'angemeldeter Nutzer durfte nicht umbenennen'; END $$;
INSERT INTO t_result VALUES ('8 anon darf nicht, angemeldete Nutzer dürfen, falsche Rolle im Token sieht nichts');

SELECT 'OK  ' || name FROM t_result ORDER BY ctid;
SELECT 'ALLE FAELLE OK (' || count(*) || ')' FROM t_result;
ROLLBACK;
