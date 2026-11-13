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
-- Hilfsfunktion: erwartet, dass der Aufruf mit diesem SQLSTATE-Code (oder Text in der Meldung) scheitert
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
CREATE FUNCTION pg_temp.snapshot() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM players) || '/' || (SELECT count(*) FROM player_aliases) || '/' || (SELECT count(*) FROM player_stats)
      || '/' || (SELECT count(*) FROM training_players) || '/' || (SELECT count(*) FROM matches)
      || '/' || (SELECT count(*) FROM league_opening_balances)
      || '/' || (SELECT md5(string_agg(coalesce(player_ref::text,'-')||player_name, ',' ORDER BY id)) FROM player_stats)
      || '/' || (SELECT md5(string_agg(coalesce(player_ref::text,'-'), ',' ORDER BY id)) FROM training_players)
      || '/' || (SELECT md5(string_agg(coalesce(home_player_ref::text,'-')||coalesce(away_player_ref::text,'-'), ',' ORDER BY id)) FROM matches)
$$;

-- ── Testdaten (erfundene Namen): Anna und Anni sind dieselbe Person, Ben ist eine andere ──
INSERT INTO players (id, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Test Anna'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test Anni'),
  ('00000000-0000-4000-8000-0000000000b1', 'Test Ben'),
  ('00000000-0000-4000-8000-0000000000c1', 'Test Cem');
INSERT INTO player_aliases (alias, player_id) VALUES ('anni alt', '00000000-0000-4000-8000-0000000000a2');

-- Anna: ein Abend, eine Partie (Heim), eine Zeile in der ersten Liga, ein Startbestand
INSERT INTO training_players (session_id, player_id, player_name, player_ref)
  SELECT id, '00000000-0000-4000-8000-0000000000e1', 'Test Anna', '00000000-0000-4000-8000-0000000000a1' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO matches (session_id, round, home_player_id, home_player_name, home_player_ref, away_player_id, away_player_name, away_player_ref)
  SELECT id, 99, '00000000-0000-4000-8000-0000000000e1', 'Test Anna', '00000000-0000-4000-8000-0000000000a1',
         '00000000-0000-4000-8000-0000000000e2', 'Test Ben', '00000000-0000-4000-8000-0000000000b1' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO player_stats (league_id, player_name, player_ref, points)
  SELECT id, 'Test Anna', '00000000-0000-4000-8000-0000000000a1', 10 FROM leagues ORDER BY name LIMIT 1;
INSERT INTO league_opening_balances (league_id, player_ref, points)
  SELECT id, '00000000-0000-4000-8000-0000000000a1', 7 FROM leagues ORDER BY name LIMIT 1;
-- Anni: ein Abend, Gast in einer Partie, eine Zeile in der ZWEITEN Liga, Startbestand dort
INSERT INTO training_players (session_id, player_id, player_name, player_ref)
  SELECT id, '00000000-0000-4000-8000-0000000000e3', 'Test Anni', '00000000-0000-4000-8000-0000000000a2' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO matches (session_id, round, home_player_id, home_player_name, home_player_ref, away_player_id, away_player_name, away_player_ref)
  SELECT id, 98, '00000000-0000-4000-8000-0000000000e2', 'Test Ben', '00000000-0000-4000-8000-0000000000b1',
         '00000000-0000-4000-8000-0000000000e3', 'Test Anni', '00000000-0000-4000-8000-0000000000a2' FROM training_sessions ORDER BY id LIMIT 1;
INSERT INTO player_stats (league_id, player_name, player_ref, points)
  SELECT id, 'Test Anni', '00000000-0000-4000-8000-0000000000a2', 3 FROM leagues ORDER BY name OFFSET 1 LIMIT 1;
INSERT INTO league_opening_balances (league_id, player_ref, points)
  SELECT id, '00000000-0000-4000-8000-0000000000a2', 2 FROM leagues ORDER BY name OFFSET 1 LIMIT 1;
-- Anni ist auch Heimspielerin einer Partie
INSERT INTO matches (session_id, round, home_player_id, home_player_name, home_player_ref, away_player_id, away_player_name, away_player_ref)
  SELECT id, 97, '00000000-0000-4000-8000-0000000000e3', 'Test Anni', '00000000-0000-4000-8000-0000000000a2',
         '00000000-0000-4000-8000-0000000000e2', 'Test Ben', '00000000-0000-4000-8000-0000000000b1' FROM training_sessions ORDER BY id LIMIT 1;
-- Ben steht in BEIDEN Ligen wie Anna bzw. Anni (für den Fall "gleiche Liga")
INSERT INTO player_stats (league_id, player_name, player_ref, points)
  SELECT id, 'Test Ben', '00000000-0000-4000-8000-0000000000b1', 1 FROM leagues ORDER BY name LIMIT 1;
INSERT INTO player_stats (league_id, player_name, player_ref, points)
  SELECT id, 'Test Ben', '00000000-0000-4000-8000-0000000000b1', 1 FROM leagues ORDER BY name OFFSET 1 LIMIT 1;

-- ── Fall 1: Umbenennen ──
DO $$
DECLARE v_ben_before text;
BEGIN
  PERFORM rename_player('00000000-0000-4000-8000-0000000000b1', '  Test   Benno ');
  ASSERT (SELECT display_name FROM players WHERE id = '00000000-0000-4000-8000-0000000000b1') = 'Test Benno', 'Name nicht gesetzt oder Leerzeichen nicht bereinigt';
  ASSERT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test ben' AND player_id = '00000000-0000-4000-8000-0000000000b1'), 'alter Name ist kein Alias';
  ASSERT (SELECT count(*) FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000b1' AND player_name = 'Test Benno') = 2, 'Liga-Zeilen zeigen nicht den neuen Namen';
  ASSERT (SELECT count(*) FROM matches WHERE home_player_name = 'Test Ben' OR away_player_name = 'Test Ben') >= 2, 'Namen in Partien dürfen sich nicht ändern';
  ASSERT (SELECT player_name FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e1') = 'Test Anna', 'Namen am Abend dürfen sich nicht ändern';
  -- gleicher Name noch einmal: nichts passiert
  PERFORM rename_player('00000000-0000-4000-8000-0000000000b1', 'Test Benno');
  -- zurück auf den alten Namen: der neue Name ist dann kein Alias seiner selbst
  PERFORM rename_player('00000000-0000-4000-8000-0000000000b1', 'Test Ben');
  ASSERT NOT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test ben'), 'der eigene Name steht als Alias';
  ASSERT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test benno'), 'der zwischenzeitliche Name ist kein Alias';
END $$;
INSERT INTO t_result VALUES ('1 Umbenennen');

-- ── Fall 2 und 3: Umbenennen auf einen vergebenen Namen ──
DO $$
DECLARE v text := pg_temp.snapshot();
BEGIN
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000c1', '  test   ANNA')$q$, '23505');
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000c1', 'Anni Alt')$q$, NULL, 'anderer Name eines anderen Spielers');
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000c1', '   ')$q$, NULL, 'leer');
  PERFORM pg_temp.expect_error($q$SELECT rename_player('00000000-0000-4000-8000-0000000000ff', 'Irgendwer')$q$, NULL, 'nicht gefunden');
  ASSERT (SELECT display_name FROM players WHERE id = '00000000-0000-4000-8000-0000000000c1') = 'Test Cem', 'Name wurde trotz Fehler geändert';
END $$;
INSERT INTO t_result VALUES ('2/3 Umbenennen auf vergebenen Namen oder Alias, leeren Namen, unbekannten Spieler');

-- ── Fall 4: Zusammenführen (Anni -> Cem, beide nicht in derselben Liga) ──
-- Cem bekommt dafür Zeilen in der ersten Liga (Anni steht in der zweiten)
INSERT INTO player_stats (league_id, player_name, player_ref, points)
  SELECT id, 'Test Cem', '00000000-0000-4000-8000-0000000000c1', 5 FROM leagues ORDER BY name LIMIT 1;
DO $$
DECLARE
  v_rows_before text;
BEGIN
  SELECT (SELECT count(*) FROM player_stats) || '/' || (SELECT count(*) FROM training_players) || '/' || (SELECT count(*) FROM matches)
     || '/' || (SELECT count(*) FROM league_opening_balances) INTO v_rows_before;
  PERFORM merge_players('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1');
  ASSERT NOT EXISTS (SELECT 1 FROM players WHERE id = '00000000-0000-4000-8000-0000000000a2'), 'die Quelle wurde nicht gelöscht';
  ASSERT (SELECT player_ref FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e3') = '00000000-0000-4000-8000-0000000000c1', 'training_players nicht umgehängt';
  ASSERT (SELECT away_player_ref FROM matches WHERE round = 98) = '00000000-0000-4000-8000-0000000000c1', 'Gast-Verweis nicht umgehängt';
  ASSERT (SELECT home_player_ref FROM matches WHERE round = 97) = '00000000-0000-4000-8000-0000000000c1', 'Heim-Verweis nicht umgehängt';
  ASSERT (SELECT player_ref FROM player_stats WHERE player_name = 'Test Cem' AND points = 3) = '00000000-0000-4000-8000-0000000000c1', 'player_stats nicht umgehängt';
  ASSERT EXISTS (SELECT 1 FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000c1' AND points = 3 AND player_name = 'Test Cem'), 'Liga-Zeile zeigt nicht den Namen des Ziels';
  ASSERT (SELECT count(*) FROM league_opening_balances WHERE player_ref = '00000000-0000-4000-8000-0000000000c1') = 1, 'Startbestand nicht umgehängt';
  ASSERT (SELECT player_id FROM player_aliases WHERE alias = 'anni alt') = '00000000-0000-4000-8000-0000000000c1', 'alter Alias zeigt nicht auf das Ziel';
  ASSERT (SELECT player_id FROM player_aliases WHERE alias = 'test anni') = '00000000-0000-4000-8000-0000000000c1', 'Name der Quelle ist kein Alias des Ziels';
  ASSERT (SELECT (SELECT count(*) FROM player_stats) || '/' || (SELECT count(*) FROM training_players) || '/' || (SELECT count(*) FROM matches)
     || '/' || (SELECT count(*) FROM league_opening_balances)) = v_rows_before, 'es sind Zeilen verloren gegangen oder dazugekommen';
  -- die Namen am Abend und in der Partie bleiben, wie sie getippt wurden
  ASSERT (SELECT player_name FROM training_players WHERE player_id = '00000000-0000-4000-8000-0000000000e3') = 'Test Anni', 'Name am Abend geändert';
END $$;
INSERT INTO t_result VALUES ('4 Zusammenführen hängt alles um, nichts geht verloren');

-- ── Fall 5: Zusammenführen abgelehnt, wenn beide in derselben Liga stehen: nichts geschieht ──
DO $$
DECLARE v text;
BEGIN
  v := pg_temp.snapshot();
  -- Anna und Ben stehen beide in der ersten Liga
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')$q$, NULL, 'Beide Spieler stehen in der Liga');
  ASSERT pg_temp.snapshot() = v, 'trotz Ablehnung wurde etwas verändert';
END $$;
INSERT INTO t_result VALUES ('5 Zusammenführen in derselben Liga wird abgelehnt, nichts verändert');

-- ── Fall 6: Zusammenführen mit sich selbst, mit unbekanntem Spieler, mit Alias eines Dritten ──
DO $$
DECLARE v text := pg_temp.snapshot();
BEGIN
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1')$q$, NULL, 'mit sich selbst');
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000ff')$q$, NULL, 'nicht gefunden');
  -- Der Name des Quellspielers darf nicht schon ein Alias eines Dritten sein (E und F stehen in keiner Liga)
  INSERT INTO players (id, display_name) VALUES
    ('00000000-0000-4000-8000-0000000000e5', 'Test E'), ('00000000-0000-4000-8000-0000000000f5', 'Test F'), ('00000000-0000-4000-8000-0000000000d1', 'Test Dritter');
  INSERT INTO player_aliases (alias, player_id) VALUES ('test e', '00000000-0000-4000-8000-0000000000d1');
  v := pg_temp.snapshot();
  PERFORM pg_temp.expect_error($q$SELECT merge_players('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000f5')$q$, NULL, 'dritten Spielers');
  ASSERT pg_temp.snapshot() = v, 'trotz Ablehnung wurde etwas verändert';
  DELETE FROM player_aliases WHERE alias = 'test e';
  DELETE FROM players WHERE id IN ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000d1');
  ASSERT pg_temp.snapshot() IS NOT NULL;
END $$;
INSERT INTO t_result VALUES ('6 Zusammenführen mit sich selbst, unbekanntem Spieler oder fremdem Alias wird abgelehnt');

-- ── Fall 7: Löschen ──
DO $$
BEGIN
  PERFORM pg_temp.expect_error($q$DELETE FROM players WHERE id = '00000000-0000-4000-8000-0000000000a1'$q$, '23503');   -- kommt noch vor
  INSERT INTO players (id, display_name) VALUES ('00000000-0000-4000-8000-0000000000d2', 'Test Unbenutzt');
  DELETE FROM players WHERE id = '00000000-0000-4000-8000-0000000000d2';                                              -- kommt nirgends vor
  ASSERT NOT EXISTS (SELECT 1 FROM players WHERE id = '00000000-0000-4000-8000-0000000000d2');
END $$;
INSERT INTO t_result VALUES ('7 Löschen nur eines unbenutzten Spielers');

-- ── Fall 8: zweite Zeile desselben Spielers in derselben Liga ──
DO $$
BEGIN
  PERFORM pg_temp.expect_error($q$INSERT INTO player_stats (league_id, player_name, player_ref)
    SELECT league_id, 'Test Anna doppelt', player_ref FROM player_stats WHERE player_ref = '00000000-0000-4000-8000-0000000000a1' LIMIT 1$q$, '23505');
  -- Zeilen ohne Identität sind davon ausgenommen (zwei Zeilen mit NULL sind erlaubt)
  INSERT INTO player_stats (league_id, player_name) SELECT id, 'Ohne Identität' FROM leagues LIMIT 1;
  INSERT INTO player_stats (league_id, player_name) SELECT id, 'Ohne Identität' FROM leagues LIMIT 1;
END $$;
INSERT INTO t_result VALUES ('8 Eindeutigkeit je Liga gilt nur für Zeilen mit Identität');

-- ── Fall 9: Rechte ──
-- Die Funktionen laufen mit den Rechten des Aufrufers: anon darf sie nicht aufrufen, angemeldete Nutzer schon
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.rename_player(uuid,text)', 'EXECUTE'), 'anon darf rename_player ausführen';
  ASSERT NOT has_function_privilege('anon', 'public.merge_players(uuid,uuid)', 'EXECUTE'), 'anon darf merge_players ausführen';
  ASSERT has_function_privilege('authenticated', 'public.rename_player(uuid,text)', 'EXECUTE'), 'authenticated darf rename_player nicht ausführen';
  ASSERT has_function_privilege('authenticated', 'public.merge_players(uuid,uuid)', 'EXECUTE'), 'authenticated darf merge_players nicht ausführen';
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
INSERT INTO t_result VALUES ('9 anon darf nicht, angemeldete Nutzer dürfen');

SELECT 'OK  ' || name FROM t_result ORDER BY ctid;
SELECT 'ALLE FAELLE OK (' || count(*) || ')' FROM t_result;
ROLLBACK;
