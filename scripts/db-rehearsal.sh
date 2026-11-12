#!/usr/bin/env bash
# Probelauf für Datenbank-Migrationen an einer lokalen Kopie der echten Daten.
#
#   scripts/db-rehearsal.sh <backup-data-dir> [zusätzliche-migration.sql ...]
#
# 1. startet einen frischen, lokalen PostgreSQL 16 (Port 54329, nur Unix-Socket, Daten in /var/tmp/mm-pg)
# 2. legt die Supabase-Rollen/Funktionen an, die die Migrationen erwarten (anon, authenticated, auth.role())
# 3. spielt alle Migrationen aus supabase/migrations/ der Reihe nach ein
# 4. lädt die JSON-Dateien aus dem Backup (data/*.json)
# 5. spielt die übergebenen zusätzlichen Migrationen ein (die neue, noch nicht live angewendete); liegt eine davon schon
#    in supabase/migrations/, wird sie in Schritt 3 übersprungen und erst hier, nach den Daten, angewendet
# Danach: psql -h /var/tmp/mm-pg -p 54329 -U postgres   (Server stoppen: scripts/db-rehearsal.sh --stop)
#
# Berührt NICHT die Live-Datenbank. Bricht beim ersten Fehler ab.
set -euo pipefail
PG=/usr/lib/postgresql/16/bin
DIR=/var/tmp/mm-pg
PORT=54329
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$1"; else bash -c "$1"; fi; }
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

if [ "${1:-}" = "--stop" ]; then as_pg "$PG/pg_ctl -D $DIR/data stop -m fast" || true; exit 0; fi
DATA="${1:?Pfad zum Backup-Ordner data/ angeben}"; shift
[ -f "$DATA/matches.json" ] || { echo "Keine Backup-Dateien in $DATA"; exit 1; }

as_pg "$PG/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true
rm -rf "$DIR"; mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown postgres "$DIR"
as_pg "$PG/initdb -D $DIR/data -U postgres --auth=trust >/dev/null"
as_pg "$PG/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=' -l $DIR/log start >/dev/null"
for i in $(seq 1 20); do as_pg "$PG/pg_isready -h $DIR -p $PORT -q" && break; sleep 0.5; done
run_sql() { as_pg "$PSQL -f '$1'"; }

# Supabase-Umgebung nachbilden
SHIM="$DIR/shim.sql"
cat > "$SHIM" <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
chmod a+r "$SHIM"; run_sql "$SHIM"

# Migrations given as extra arguments are the ones under test: they are applied AFTER the backup data is loaded
# (the backup was taken before them), even when the file already lies in supabase/migrations/.
UNDER_TEST=" "; for f in "$@"; do UNDER_TEST="$UNDER_TEST$(basename "$f") "; done
for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$UNDER_TEST" in *" $(basename "$f") "*) continue;; esac
  cp "$f" "$DIR/m.sql"; chmod a+r "$DIR/m.sql"; run_sql "$DIR/m.sql"; echo "Migration: $(basename "$f")"
done

# Backup laden (Reihenfolge wegen Fremdschlüsseln)
as_pg "$PSQL -c 'DELETE FROM public.current_session'"
for t in leagues training_sessions player_stats training_players matches current_session; do
  cp "$DATA/$t.json" "$DIR/$t.json"; chmod a+r "$DIR/$t.json"
  as_pg "$PSQL -c \"INSERT INTO public.$t SELECT * FROM json_populate_recordset(NULL::public.$t, pg_read_file('$DIR/$t.json')::json)\""
  echo "Geladen: $t $(as_pg "psql -h $DIR -p $PORT -U postgres -tAc 'SELECT count(*) FROM public.$t'")"
done

for f in "$@"; do cp "$f" "$DIR/m.sql"; chmod a+r "$DIR/m.sql"; run_sql "$DIR/m.sql"; echo "Neue Migration: $(basename "$f")"; done
echo "Fertig. Verbinden: psql -h $DIR -p $PORT -U postgres"
