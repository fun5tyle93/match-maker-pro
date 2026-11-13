# Umsetzungsplan 2: Nacharbeiten nach den Schritten A bis E

Stand: 13.11.2026. Erstellt nach einer Prüfung der Umsetzung von `docs/UMSETZUNGSPLAN.md`.
Dieser Plan ist für ein Sprachmodell geschrieben, das ihn ohne Rückfragen abarbeiten soll. Lies ihn **vollständig**, bevor du anfängst.

**Reihenfolge (verbindlich):** 1 → 2 → 3 → 4 → 5 → 6. Jeder Punkt ist ein eigener Branch und ein eigener PR. Beginne einen Punkt erst, wenn der vorige gemergt ist (immer von aktuellem `main` abzweigen).

| Nr. | Thema | Repository | Datenbank | Stopp-Punkte |
|---|---|---|---|---|
| 1 | Backup und Wiederherstellung um die neuen Tabellen ergänzen | **Backup-Repository** (privat) + App-Repository (`scripts/db-rehearsal.sh`) | nein | Backup-Lauf von Hand durch den Nutzer |
| 2 | Regel „außer Konkurrenz“ (a.K.) auch für Schweizer Turniere | App | nein | keine |
| 3 | Admin-Seite „Spielerliste“ (umbenennen, zusammenführen, löschen, Liga-Zeilen zuordnen) | App | Migration (Funktionen + Index) | Migration live |
| 4 | Liga-Übertragung schreibt nur geänderte Zeilen, löscht nie | App | nein | keine |
| 5 | Schweizer Turniere in der Ligenprüfung | App | nein | keine |
| 6 | Dokumentationsseite der App aktualisieren | App | nein | keine |

---

## 0. Arbeitsweise (gilt für alle Punkte)

Die Regeln aus `docs/UMSETZUNGSPLAN.md`, Abschnitte 1 und 2, gelten unverändert. Die wichtigsten noch einmal:

- **Ein Punkt = ein Branch = ein PR.** PR nur per REST anlegen (GraphQL ist blockiert):
  `gh api repos/<owner>/<repo>/pulls -f title=... -f head=<branch> -f base=main -F body=@<datei>`
- **Mergen nur nach „mergen“ des Nutzers:**
  `gh api repos/<owner>/<repo>/pulls/<N>/merge -X PUT -f merge_method=merge -f commit_title="<Titel> (#<N>)"`
- **Branches löschen geht nicht** (Proxy). Nenne dem Nutzer am Ende die gemergten Branches.
- **Sprache:** mit dem Nutzer und in UI-Texten Deutsch; Code-Kommentare und Commit-Nachrichten Englisch.
- **Keine Vereinsnamen im App-Repository** (es ist öffentlich). Namen nur im privaten Backup-Repository `fun5tyle93/backup-TKMatchmaker`. In Tests und Beispielen erfundene Namen benutzen (Anna, Ben, Cem, …).
- **Datenbank:** jede Migration erst an der Probe-Datenbank (`scripts/db-rehearsal.sh`), live erst nach ausdrücklicher Freigabe, live immer Fingerabdruck vorher und nachher (`scripts/db-invariants.sql`; die kompakte Form mit `count(*)` und `md5(string_agg(...))` steht im alten Plan bzw. in den PR-Texten der Schritte C/D).
- **Prüfungen vor jedem PR** (Stand vor diesem Plan: 384 Tests, Lint 18 Fehler / 6 Warnungen):
  ```bash
  npm run typecheck && npx vitest run && npx eslint . | tail -2   # Lint darf nicht schlechter werden
  npm run build
  (npx vite preview --host 127.0.0.1 --port 4173 --strictPort >/tmp/preview.log 2>&1 &) ; sleep 4
  node e2e/<test>.mjs http://127.0.0.1:4173 <ausgabeordner>
  python3 /home/user/fun5tyle93/scratchpad_out/killpreview.py   # Vorschau beenden, NIE pkill -f "vite preview"
  ```
  Alle Browsertests aus `e2e/README.md` müssen nach jedem Punkt weiter laufen.
- **Mutationsprobe:** Für jede neue Regel baust du absichtlich einen Fehler ein (zum Beispiel eine Bedingung entfernen), startest den passenden Test, er **muss** fehlschlagen, dann stellst du die Datei wieder her. Überlebt eine Mutation, fehlt ein Test. Ergänze ihn.
- **Berichte ehrlich**, was du getestet hast und was nicht.

Nützliche Orte im Code:

| Was | Wo |
|---|---|
| Datenbankzugriff | `src/lib/storage.ts` (`fetchAll`, `serialized`, `schemaFeatures`, `upsertRows`, `loadPlayerRegistry`, `createPlayer`, `loadOpeningBalances`, `saveOpeningBalances`, `saveLeague`) |
| Übertragung eines Abends in eine Liga | `src/lib/leagueTransfer.ts` (`applySessionToLeague`), aufgerufen in `src/pages/Training.tsx` und `src/pages/SchweizSystem.tsx` (`handleTransferResults`) |
| Titelregel a.K. | `src/lib/ranking.ts` (`isOutOfCompetition`, `leagueTitleHolders`) |
| Endwertung Schweizer System | `src/pages/swissHelpers.ts` (`computeFinalSwissStats`), `src/lib/swissRanking.ts` (`rankSession`, `sessionFinalRanking`, interne Funktion `roundsOf`) |
| Ligenprüfung | `src/lib/leagueStandings.ts`, `src/lib/leagueCheck.ts`, `src/components/LeagueCheckCard.tsx` |
| Spielerliste | `src/lib/playerRegistry.ts`, `src/lib/playerPicker.ts`, `src/hooks/usePlayerRegistry.ts`, `src/components/PlayerNameField.tsx` |
| Supabase-Typen | `src/integrations/supabase/types.ts` (von Hand pflegen, Muster: vorhandene Tabellen) |
| Test-Ersatz für Supabase in Unit-Tests | `src/lib/__tests__/storageRefs.test.ts` (der umfangreichste: PostgREST-Verhalten bei Sammel-Upserts, zusammengesetzte Schlüssel) |

---

## 1. Backup und Wiederherstellung um die neuen Tabellen ergänzen

**Repository:** `fun5tyle93/backup-TKMatchmaker` (privat, lokal unter `/home/user/backup-tkmatchmaker`), Branch `fix/backup-new-tables`. Zusätzlich im App-Repository Branch `chore/rehearsal-new-tables` für `scripts/db-rehearsal.sh`.

### 1.1 Befund

- `.github/workflows/backup.yml` sichert nur `training_sessions training_players matches leagues player_stats current_session`.
- Seit den Schritten D und E gibt es drei weitere Tabellen:

  | Tabelle | Primärschlüssel | Verweise |
  |---|---|---|
  | `players` | `id` | – |
  | `player_aliases` | `alias` (kein `id`!) | `player_id → players.id` |
  | `league_opening_balances` | `(league_id, player_ref)` (kein `id`!) | `league_id → leagues.id`, `player_ref → players.id` |

- Außerdem verweisen jetzt `player_stats.player_ref`, `training_players.player_ref`, `matches.home_player_ref` und `matches.away_player_ref` auf `players.id`. Diese Spalten sind in der Sicherung enthalten (`select=*`), die Zieltabelle `players` aber nicht. **Eine Wiederherstellung in eine leere Datenbank scheitert deshalb an den Fremdschlüsseln.**
- `backup.yml` sortiert mit `order=id.asc`. Für `player_aliases` und `league_opening_balances` liefert PostgREST dann einen Fehler, weil es die Spalte `id` nicht gibt.
- `restore.mjs` verlangt in jeder Zeile eine `id` (Prüfung „Zeile hat keine id“) und schreibt mit `on_conflict=id`. Beides passt nicht zu den neuen Tabellen.

### 1.2 `backup.yml`: Schleife in ein Skript auslagern

Damit die Sicherung testbar wird, kommt die Schleife in ein eigenes Skript `scripts/backup.sh`. Der Workflow ruft nur noch das Skript auf.

`scripts/backup.sh` (ausführbar, `set -euo pipefail`):

```bash
#!/usr/bin/env bash
# Holt alle Tabellen aus Supabase und legt sie als JSON in data/ ab.
# Benötigt: SUPABASE_URL, SUPABASE_KEY (anon), curl, jq. DATA_DIR optional (Standard: data).
set -euo pipefail
: "${SUPABASE_URL:?}" "${SUPABASE_KEY:?}"
DATA_DIR="${DATA_DIR:-data}"
mkdir -p "$DATA_DIR"

# Tabelle:Sortierung. Die Sortierung muss eindeutig sein, sonst ist das seitenweise Lesen unvollständig.
TABLES="
training_sessions:id.asc
training_players:id.asc
matches:id.asc
leagues:id.asc
player_stats:id.asc
current_session:id.asc
players:id.asc
player_aliases:alias.asc
league_opening_balances:league_id.asc,player_ref.asc
"
for entry in $TABLES; do
  table="${entry%%:*}"; order="${entry#*:}"
  echo "[]" > "$DATA_DIR/$table.json"
  offset=0
  while true; do
    page=$(curl -fsS --retry 3 --retry-delay 5 \
      "$SUPABASE_URL/rest/v1/$table?select=*&order=$order&limit=1000&offset=$offset" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY")
    count=$(printf '%s' "$page" | jq 'length')
    jq -s '.[0] + .[1]' "$DATA_DIR/$table.json" <(printf '%s' "$page") > "$DATA_DIR/$table.tmp"
    mv "$DATA_DIR/$table.tmp" "$DATA_DIR/$table.json"
    [ "$count" -lt 1000 ] && break
    offset=$((offset + 1000))
  done
  echo "$table: $(jq length "$DATA_DIR/$table.json") Zeilen"
done

# Schutz: ein leeres Ergebnis darf kein gutes Backup ersetzen
for must in training_sessions leagues players; do
  if [ "$(jq length "$DATA_DIR/$must.json")" -eq 0 ]; then
    echo "Abgebrochen: $must ist leer. Zugriff auf Supabase prüfen."; exit 1
  fi
done
```

Hinweis: `players` ist seit Schritt D nie leer (207 Spieler). Die Rolle `anon` darf alle drei neuen Tabellen lesen (geprüft).

`backup.yml`, Schritt „Daten aus Supabase holen“: den `run`-Block ersetzen durch

```yaml
        run: ./scripts/backup.sh
```

(`env` mit `SUPABASE_URL` und `SUPABASE_KEY` bleibt.) Der Schritt „Sicherung speichern“ bleibt unverändert.

### 1.3 `restore.mjs`: Schlüssel und Verweise je Tabelle

Ersetze die Liste `TABLES` und alle Stellen, die `id` fest annehmen. Neue Liste, **in dieser Reihenfolge** (zuerst die Tabellen, auf die andere verweisen):

```js
// key: Primärschlüssel; refs: Spalte -> verwiesene Tabelle; optional: Datei darf in alten Sicherungen fehlen
const TABLES = [
  { name: 'leagues', key: ['id'], refs: {} },
  { name: 'training_sessions', key: ['id'], refs: {} },
  { name: 'players', key: ['id'], refs: {}, optional: true },
  { name: 'player_aliases', key: ['alias'], refs: { player_id: 'players' }, optional: true },
  { name: 'player_stats', key: ['id'], refs: { league_id: 'leagues', player_ref: 'players' } },
  { name: 'training_players', key: ['id'], refs: { session_id: 'training_sessions', player_ref: 'players' } },
  { name: 'matches', key: ['id'], refs: { session_id: 'training_sessions', home_player_ref: 'players', away_player_ref: 'players' } },
  { name: 'league_opening_balances', key: ['league_id', 'player_ref'], refs: { league_id: 'leagues', player_ref: 'players' }, optional: true },
  { name: 'current_session', key: ['id'], refs: { session_id: 'training_sessions' } },
];
const keyOf = (table, row) => table.key.map(k => row[k]).join('|');
```

Änderungen im Ablauf:

1. **Lesen:** Fehlt die Datei einer `optional`-Tabelle, wird sie mit dem Hinweis `"<name>.json fehlt (ältere Sicherung), wird übersprungen"` übersprungen (`backup[name] = null`). Fehlt eine nicht-optionale Datei: Fehler wie bisher.
2. **Prüfen:** statt „Zeile hat keine id“ prüfen, dass **jede Spalte aus `key`** gesetzt ist (`row[k] != null && row[k] !== ''`), und Doppelte über `keyOf`.
3. **Verweise:** für jede Spalte in `refs` prüfen, dass der Wert (wenn nicht `null`) als **`id`** in der verwiesenen Tabelle vorkommt. Ist die verwiesene Tabelle übersprungen (`null`), aber die Spalte in Zeilen gefüllt: Fehler `"<name>: <n> Zeilen verweisen über <spalte> auf players, die Sicherung enthält aber keine players.json"`. Das ist genau der Fall „neue Daten, alte Sicherungslogik“ und muss vor dem Schreiben abbrechen.
4. **Live lesen:** `liveIds(table)` wird zu `liveKeys(table)`: `select=<key-spalten kommagetrennt>&order=<key-spalten jeweils .asc>`, Ergebnis über `keyOf`. Für übersprungene Tabellen nichts lesen.
5. **Schreiben:** `on_conflict=<key-spalten kommagetrennt>` (zum Beispiel `on_conflict=league_id,player_ref`). Header unverändert (`Prefer: resolution=merge-duplicates,return=minimal`). Übersprungene Tabellen nicht schreiben.
6. **Kontrolle** am Ende über `liveKeys` und `keyOf`.
7. Die Ausgabe-Tabelle (Probelauf) listet die neuen Tabellen mit; übersprungene als `übersprungen`.

Der Rest (Login, Chunks von 200, „löscht nie etwas“) bleibt.

### 1.4 `RESTORE.md` und `README.md`

- `RESTORE.md`: in „Schritt 1“ erwähnen, dass jetzt neun Tabellen geprüft werden, und dass ältere Sicherungen ohne `players.json` usw. weiter funktionieren, solange ihre Zeilen keine Spieler-Verweise enthalten.
- Abschnitt „Eine neue, leere Supabase-Datenbank“: ergänzen, dass die Migrationen **alle** ausgeführt werden müssen (auch die neueren für Spieler und Ligenprüfung), bevor `restore.mjs --apply` läuft.
- `README.md`: Satz ergänzen, dass `scripts/backup.sh` die Tabellenliste enthält und bei jeder neuen Tabelle in der App ergänzt werden muss, ebenso `restore.mjs`.

### 1.5 Tests im Backup-Repository

**a) `tests/test-backup.sh`** (Muster: `tests/test-watchdog.sh`): ein vorgetäuschtes `curl` in einem temporären `bin`-Ordner, das je nach URL eine JSON-Seite ausgibt und jeden Aufruf in eine Datei protokolliert.
Fälle:
1. Alle neun Tabellen werden geholt, je Tabelle eine Datei in `DATA_DIR`.
2. Die Sortierung je Tabelle stimmt (Aufrufprotokoll enthält `player_aliases?select=*&order=alias.asc` und `league_opening_balances?select=*&order=league_id.asc,player_ref.asc`).
3. Seitenweises Lesen: das vorgetäuschte `curl` liefert für `matches` erst 1000, dann 5 Zeilen → Datei hat 1005 Einträge, zwei Aufrufe mit `offset=0` und `offset=1000`.
4. Leere `players` → Exit-Code ungleich 0 und Meldung „players ist leer“.

**b) `tests/test-restore.mjs`** (Node, keine Pakete): startet einen kleinen Ersatz-Server mit `node:http` auf einem freien Port, der PostgREST nachahmt, und ruft `restore.mjs` als Kindprozess auf (`SUPABASE_URL=http://127.0.0.1:<port>`, `SUPABASE_ANON_KEY=x`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATA_DIR=<temporärer Ordner mit Test-JSON>`).
Der Ersatz-Server kann:
- `POST /auth/v1/token?grant_type=password` → `{ "access_token": "t" }`
- `GET /rest/v1/<tabelle>?select=<spalten>&order=...&limit=...&offset=...` → Zeilen aus seinem Speicher, nur die verlangten Spalten, Seiten beachten
- `POST /rest/v1/<tabelle>?on_conflict=<spalten>` → Upsert über die genannten Spalten. **Er prüft die Fremdschlüssel** wie die echte Datenbank (Tabelle der Verweise wie in 1.3): verweist eine Zeile auf eine fehlende Zeile, antwortet er mit HTTP 409 und `{"code":"23503"}`. So beweist der Test die Reihenfolge.

Fälle (jeder Fall mit frischem Server-Speicher):
1. **Vollständige neue Sicherung, Probelauf:** Exit 0, Ausgabe enthält alle neun Tabellen, nichts geschrieben.
2. **Vollständige neue Sicherung, `--apply` in leere DB:** Exit 0, alle Zeilen im Server, Kontrolle „ok“ für alle Tabellen.
3. **Zweimal `--apply`:** keine doppelten Zeilen (auch nicht in `player_aliases` und `league_opening_balances`).
4. **Ältere Sicherung** (nur die sechs alten Dateien, Zeilen ohne `*_ref`): Exit 0, Hinweis „übersprungen“ für die drei neuen Tabellen.
5. **Gefährlicher Fall:** sechs alte Dateien, aber `player_stats` enthält `player_ref` → Exit ungleich 0 **vor** jedem Schreibzugriff (Server-Speicher bleibt leer), Meldung nennt `players`.
6. **Kaputter Verweis:** `player_aliases.player_id` zeigt auf einen nicht gesicherten Spieler → Exit ungleich 0, nichts geschrieben.
7. **Doppelter Schlüssel** in `league_opening_balances` (gleiche Liga, gleicher Spieler zweimal) → Exit ungleich 0.

Mutationsproben: Reihenfolge `players` hinter `player_stats` schieben → Fall 2 muss scheitern. Prüfung aus 1.3 Punkt 3 entfernen → Fall 5 muss scheitern.

Beide Tests im README unter „Tests“ mit Aufruf nennen. Wenn das Repository eine CI hat, dort aufnehmen; es hat zurzeit keine, dann nur lokal laufen lassen.

### 1.6 App-Repository: `scripts/db-rehearsal.sh`

Die Probe lädt heute nur die sechs alten Tabellen. Ändere die Lade-Schleife:

```bash
for t in leagues training_sessions players player_aliases player_stats training_players matches league_opening_balances current_session; do
  [ -f "$DATA/$t.json" ] || { echo "Übersprungen (keine Datei): $t"; continue; }
  ...  # wie bisher
done
```

Achtung: Die Migration `20261113110000_training_players_unique.sql` (Schritt C) liegt in `supabase/migrations/` und wird vor dem Laden angewendet. Sicherungen von **vor** dem 13.11.2026 enthalten noch die doppelten Spielerzeilen und lassen sich deshalb nur laden, wenn diese Migration als zusätzliches Argument übergeben wird (dann greift sie nach dem Laden). Schreibe das als Kommentar in den Kopf des Skripts. Neue Sicherungen sind davon nicht betroffen.

### 1.7 Abnahme Punkt 1

1. `./tests/test-backup.sh` und `node tests/test-restore.mjs` grün, Mutationsproben schlagen an.
2. `scripts/backup.sh` einmal **lokal lesend** gegen die echte Datenbank laufen lassen: `SUPABASE_URL=https://swuwjjmspplzfguapvty.supabase.co SUPABASE_KEY=<anon-key aus src/integrations/supabase/client.ts des App-Repositories> DATA_DIR=<scratchpad>/backup-test ./scripts/backup.sh`. Erwartet: neun Dateien, `players` 207+ Zeilen, `player_aliases` 4, `league_opening_balances` 239. (Lesend, schreibt nichts in die Datenbank. Die Dateien **nicht** ins Repository übernehmen.)
3. `node restore.mjs` (Probelauf, ohne `--apply`) mit `DATA_DIR=<scratchpad>/backup-test` gegen die echte Datenbank: überall „fehlen in DB“ = 0.
4. Probe-Datenbank aus `<scratchpad>/backup-test` aufbauen (`scripts/db-rehearsal.sh <scratchpad>/backup-test`, ohne Zusatzmigration) und danach `scripts/db-players-check.sql` laufen lassen: Werte wie live (207 Spieler, 4 Aliase, 0 Spielerzeilen ohne Referenz, 4 Liga-Zeilen ohne Referenz).
5. PR im Backup-Repository anlegen (`gh api repos/fun5tyle93/backup-TKMatchmaker/pulls ...`), dazu der kleine PR im App-Repository für `db-rehearsal.sh`.
6. 🛑 Nach dem Merge: den Nutzer bitten, unter GitHub → Backup-Repository → Actions → „Supabase-Backup“ → „Run workflow“ einen Lauf zu starten (du kannst Workflows nicht starten, der Proxy blockiert es). Danach prüfen: `data/` enthält die neun Dateien mit den erwarteten Zeilenzahlen.

---

## 2. Regel „außer Konkurrenz“ (a.K.) auch für Schweizer Turniere

**Branch:** `fix/swiss-out-of-competition`. Keine Datenbankänderung.

### 2.1 Befund

Die Regel (vom Nutzer am 13.11.2026 entschieden): Ein Spieler, dessen Name auf „a.K.“ endet (`isOutOfCompetition` in `ranking.ts`), bekommt **nie** einen Meister- oder Vizetitel in einer Liga; der nächste Spieler rückt nach. Spiele, Punkte und Tore zählen normal. Die Anzeige des Abend- oder Turniersiegers in Historie und Statistik bleibt unverändert.

Umgesetzt ist das nur für Trainingsabende (`leagueTitleHolders`). Beim Schweizer System bestimmt `computeFinalSwissStats` in `src/pages/swissHelpers.ts` die Titel so:
- ohne Playoff: `swissStats[0]` und `swissStats[1]` (erster und zweiter der Vorrunde),
- mit beendetem Playoff: Sieger und Verlierer des Finales (`getPlayoffFinalists`).
Ein a.K.-Spieler kann so Meister oder Vize werden.

### 2.2 Regel für das Schweizer System

Die Reihenfolge, aus der die Titel kommen, ist:
- **mit beendetem Playoff** (das Finale hat einen Sieger): die Abschlussrangliste nach SO § 9 Abs. 6 (`sessionFinalRanking`); deren Platz 1 ist der Finalsieger, Platz 2 der Finalverlierer, danach nach Ausscheiderunde.
- **sonst:** die Rangliste der Vorrunde (`swissStats`).

**Meister = erster Spieler dieser Reihenfolge, der nicht a.K. ist. Vize = zweiter solcher Spieler.** Im Schweizer System gibt es keine geteilten Plätze (Los), deshalb keine Sonderfälle für Gleichstand.

Beispiele (in Tests übernehmen):
| Reihenfolge | Meister | Vize |
|---|---|---|
| A, B, C, D | A | B |
| A a.K., B, C | B | C |
| A, B a.K., C | A | C |
| A a.K. (Finalsieger), B (Finalverlierer), C, D | B | C |
| A a.K., B a.K., C | C | – (undefined) |
| nur A a.K. | – | – |

### 2.3 Umsetzung

1. In `src/lib/ranking.ts` eine reine Funktion ergänzen:
   ```ts
   /** Champion and runner-up for the leagues from an order without shared places (Swiss system): out-of-competition players are skipped. */
   export function titleHoldersFromOrder(order: Player[]): { winner?: Player; runnerUp?: Player } {
     const eligible = order.filter(p => !isOutOfCompetition(p.name));
     return { winner: eligible[0], runnerUp: eligible[1] };
   }
   ```
2. In `computeFinalSwissStats` (`src/pages/swissHelpers.ts`) die Titel neu bestimmen:
   - Den Block `let championName = swissStats[0]?.player.name; ...` und `if (champion) { ... }` ersetzen.
   - `getPlayoffFinalists` bleibt nur zur Frage „ist das Playoff beendet?“ (`champion` gesetzt).
   - `const order = ...` wird schon unten berechnet (Abschlussrangliste oder Vorrunde). Verschiebe diese Berechnung **vor** die Titelbestimmung und nimm die Reihenfolge der Abschlussrangliste nur, wenn `champion` gesetzt ist; sonst die Vorrunde.
   - Aus den IDs der Reihenfolge die Spieler holen (`s.players`) und `titleHoldersFromOrder` aufrufen; `championName = winner?.name`, `viceChampionName = runnerUp?.name`.
   - Die Sortierung von `stats` am Ende bleibt wie sie ist.
3. Kommentar über `computeFinalSwissStats` anpassen (Titel ohne a.K.).
4. `docs/UMSETZUNGSPLAN.md` Abschnitt 11: den Satz „für Playoff-Finalisten im Schweizer System ist die Regel noch nicht umgesetzt“ ersetzen durch „gilt auch für das Schweizer System (mit und ohne Playoff), siehe Umsetzungsplan 2, Punkt 2“.

### 2.4 Tests

- `src/lib/__tests__/ranking.test.ts`: `titleHoldersFromOrder` mit allen Beispielen aus 2.2.
- Neue Datei `src/lib/__tests__/swissFinalTitles.test.ts` (oder in eine vorhandene Swiss-Testdatei): baue zwei kleine `SwissSession`-Objekte von Hand (Muster: vorhandene Tests in `swissRanking.test.ts` bzw. `swissPairing.test.ts`; `config.rounds`, `rounds` mit `matches`, `players`, optional `playoffMatches`):
  1. Ohne Playoff, a.K.-Spieler gewinnt die Vorrunde → `championName` ist der Zweite der Vorrunde, `viceChampionName` der Dritte.
  2. Mit Playoff (Halbfinale + Finale), a.K.-Spieler gewinnt das Finale → Meister ist der Finalverlierer, Vize ist der beste Halbfinal-Verlierer nach der Abschlussrangliste.
  3. Ohne a.K. ändert sich nichts gegenüber heute: schreibe **vor** der Änderung einen Test, der für eine Sitzung mit Playoff und eine ohne die heutigen `championName`/`viceChampionName` festhält (Charakterisierung), und lass ihn nach der Änderung unverändert grün.
  4. Die Zahlen in `stats` (Punkte, Tore) sind für den a.K.-Spieler unverändert.
- Mutationsproben: Filter in `titleHoldersFromOrder` entfernen; Abschlussrangliste statt Vorrunde auch ohne beendetes Playoff verwenden.
- Browsertest `e2e/swiss-flow.mjs` muss unverändert grün sein.

---

## 3. Admin-Seite „Spielerliste“

**Branch:** `feat/player-admin`. **Migration** (Funktionen und ein Index) → 🛑 vor dem Live-Schritt Freigabe.

### 3.1 Ziel

Ein Admin kann die Liste der bekannten Spieler (`players`) pflegen, ohne SQL:
1. **Umbenennen** (der alte Name bleibt als Alias erhalten, die Liga-Zeilen zeigen den neuen Namen).
2. **Zusammenführen:** Spieler A war ein Versehen und ist in Wirklichkeit Spieler B. Alle Verweise gehen auf B, A wird Alias von B und verschwindet.
3. **Löschen** eines Spielers, der nirgends vorkommt (entsteht, wenn jemand beim Eintippen „Neuen Spieler anlegen“ bestätigt und den Abend nie spielt).
4. **Liga-Zeilen ohne Spieler zuordnen:** Zeilen in `player_stats` mit `player_ref IS NULL` (zurzeit die vier doppelten Zeilen der Ewigen Tabelle, die der Nutzer von Hand klärt) bekommen einen Spieler.

### 3.2 Migration `supabase/migrations/20261114100000_player_admin.sql`

Vorab live und an der Probe prüfen (muss 0 liefern, sonst 🛑 dem Nutzer melden):
```sql
SELECT count(*) FROM (SELECT league_id, player_ref FROM public.player_stats
  WHERE player_ref IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) x;
```

Inhalt:

```sql
-- Player list administration (Umsetzungsplan 2, Punkt 3). Functions run with the rights of the caller
-- (SECURITY INVOKER), so the row level security of the tables applies: only signed-in users can change anything.

-- A person has at most one row per league (rows without identity are not affected)
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
  UPDATE players SET display_name = v_new WHERE id = p_player;   -- unique index rejects a name that is taken
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
```

Hinweise:
- `league_opening_balances` hat den Primärschlüssel `(league_id, player_ref)`. Da beide Spieler nicht in derselben Liga stehen dürfen (Prüfung oben), kann das Umhängen keinen Konflikt erzeugen. Prüfe das in den SQL-Tests trotzdem mit einem Fall.
- `rename_player`: Der eindeutige Index `players_display_name_unique` lehnt einen schon vergebenen Namen mit Fehlercode `23505` ab. Die App zeigt dann „Den Namen gibt es schon. Zusammenführen statt umbenennen?“.
- Löschen braucht keine Funktion: `DELETE FROM players WHERE id = ...` scheitert an den Fremdschlüsseln, wenn der Spieler noch irgendwo vorkommt (Fehlercode `23503`). Die App bietet „Löschen“ nur für unbenutzte Spieler an und zeigt bei `23503` „Der Spieler kommt noch vor und kann nicht gelöscht werden.“
- Zuordnen einer Liga-Zeile: `UPDATE player_stats SET player_ref = :ref, player_name = (SELECT display_name FROM players WHERE id = :ref) WHERE id = :row AND player_ref IS NULL` – über die normale Tabelle (supabase-js `update` mit `.eq('id', row).is('player_ref', null)`). Der neue eindeutige Index verhindert eine zweite Zeile desselben Spielers in derselben Liga (Fehlercode `23505` → Meldung „Der Spieler hat in dieser Liga schon eine Zeile.“). Den Namen der Zeile setzt die App mit (zweites Feld im `update`).

### 3.3 SQL-Tests an der Probe-Datenbank

Neue Datei `scripts/test-player-admin.sql`. Sie läuft in einer Transaktion und rollt am Ende zurück (`BEGIN; ... ROLLBACK;`), damit die Probe sauber bleibt. Jeder Fall als `DO`-Block mit `ASSERT` oder `RAISE EXCEPTION`, Erwartung über `EXCEPTION WHEN ... THEN` (Muster):

```sql
BEGIN;
INSERT INTO players (id, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Test Anna'), ('00000000-0000-4000-8000-0000000000b1', 'Test Ben');
DO $$ BEGIN
  PERFORM rename_player('00000000-0000-4000-8000-0000000000a1', '  Test   Anni ');
  ASSERT (SELECT display_name FROM players WHERE id = '00000000-0000-4000-8000-0000000000a1') = 'Test Anni';
  ASSERT EXISTS (SELECT 1 FROM player_aliases WHERE alias = 'test anna');
END $$;
-- ... weitere Fälle ...
ROLLBACK;
```

Fälle:
1. Umbenennen: neuer Name gesetzt (Leerzeichen bereinigt), alter Name als Alias, Liga-Zeilen mit diesem Spieler zeigen den neuen Namen, Abend- und Partienamen unverändert.
2. Umbenennen auf einen vergebenen Namen (andere Schreibweise) → Fehler `23505`, nichts geändert.
3. Umbenennen auf den eigenen bisherigen Alias → kein Alias mehr mit dem neuen Namen.
4. Zusammenführen: Verweise in `training_players`, `matches` (Heim und Gast), `player_stats`, `league_opening_balances`, `player_aliases` zeigen auf das Ziel; alter Name ist Alias des Ziels; Quelle ist gelöscht; Anzahl der Zeilen in allen Datentabellen unverändert.
5. Zusammenführen, wenn beide in derselben Liga stehen → Fehler mit dem Liganamen, **nichts** geändert (Zeilenzahlen und Verweise vorher = nachher).
6. Zusammenführen mit sich selbst → Fehler.
7. Löschen eines benutzten Spielers → `23503`.
8. Zweite Zeile desselben Spielers in derselben Liga zuordnen → `23505`.
9. Rechte: `SET ROLE anon; SELECT rename_player(...)` → Fehler „permission denied“. `SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated';` → erlaubt.

Aufruf: `psql -h /var/tmp/mm-pg -p 54329 -U postgres -v ON_ERROR_STOP=1 -f scripts/test-player-admin.sql` (Probe vorher mit der neuen Migration aufbauen). Ergänze `e2e/README.md` bzw. den Kopf der Datei um den Aufruf.

### 3.4 App: Speicherschicht (`src/lib/storage.ts`)

```ts
export interface PlayerAdminRow {
  id: string;
  displayName: string;
  aliases: string[];
  /** evenings the player took part in (rows in training_players) */
  evenings: number;
  /** league rows of the player */
  leagueRows: { leagueId: string; leagueName: string }[];
  /** matches with this player (home or away) */
  matches: number;
}
export interface UnassignedLeagueRow { id: string; leagueId: string; leagueName: string; playerName: string; points: number; championships: number }

export async function loadPlayerAdmin(): Promise<{ players: PlayerAdminRow[]; unassigned: UnassignedLeagueRow[] }>
export async function renamePlayer(id: string, newName: string): Promise<void>      // supabase.rpc('rename_player', { p_player, p_new_name })
export async function mergePlayers(fromId: string, intoId: string): Promise<void>  // supabase.rpc('merge_players', { p_from, p_into })
export async function deletePlayer(id: string): Promise<void>                       // .from('players').delete().eq('id', id)
export async function assignLeagueRow(rowId: string, playerId: string, displayName: string): Promise<void>
```

- `loadPlayerAdmin` liest mit `fetchAll`: `players (id, display_name)`, `player_aliases (alias, player_id)`, `training_players (player_ref)`, `matches (home_player_ref, away_player_ref)`, `player_stats (id, league_id, player_name, player_ref, points, championships)`, `leagues (id, name)` und zählt im Browser. Die Zählung kommt in eine **reine Funktion** `buildPlayerAdmin(...)` in neuer Datei `src/lib/playerAdmin.ts`, damit sie ohne Datenbank testbar ist. Sortierung der Spieler: nach `displayName` (`localeCompare(…, 'de')`).
- Fehler werden geworfen (keine stillen Fehler). Die Seite übersetzt die Fehlercodes `23505` und `23503` sowie die Meldung aus `merge_players` (Text der Exception, in `error.message`) in deutsche Meldungen.
- `src/integrations/supabase/types.ts`: der Block `Functions` enthält heute nur `[_ in never]: never`. Diese Zeile **ersetzen** durch die beiden Funktionen (Args/Returns), damit `supabase.rpc` typisiert ist:
  ```ts
  rename_player: { Args: { p_player: string; p_new_name: string }; Returns: undefined }
  merge_players: { Args: { p_from: string; p_into: string }; Returns: undefined }
  ```

### 3.5 App: Seite `src/pages/Players.tsx`, Route `/spieler`

- Route in `src/App.tsx` ergänzen. Nur für Admins (`useAuth().isAdmin`); sonst Hinweis „Bitte als Admin einloggen“ wie auf anderen Seiten.
- In `src/components/Header.tsx` einen Navigationspunkt **nur für Admins** (Icon `UserCog` aus `lucide-react`, Titel „Spielerliste“), nach „Ligen“.
- Aufbau (mobil zuerst, wie die anderen Seiten; `Card`, `Button`, `Input`, `AlertDialog`, `Dialog` aus `src/components/ui`):
  1. Überschrift „Spielerliste“, darunter ein Suchfeld (filtert nach Name und Alias, Vergleich mit `normalizeName` aus `nameMatching.ts`).
  2. **Abschnitt „Liga-Zeilen ohne Spieler“** (nur sichtbar, wenn es welche gibt): je Zeile Liga, Name, Punkte, Meister; daneben `PlayerNameField` (ohne `onCreate`, also nur vorhandene Spieler wählbar) und Knopf „Zuordnen“ mit Rückfrage („„<Name>“ in „<Liga>“ wird dem Spieler „<Spieler>“ zugeordnet.“). Hinweistext: „Doppelte Zeilen bitte zuerst in der Liga bereinigen (Zahlen übertragen, eine Zeile löschen).“
  3. **Liste der Spieler:** je Spieler Name, Aliase (klein, grau), „N Abende · M Liga-Zeilen“, Aktionen:
     - „Umbenennen“ → kleiner Dialog mit Eingabefeld, Knopf „Speichern“.
     - „Zusammenführen…“ → Dialog: „„<A>“ ist in Wirklichkeit:“ + `PlayerNameField` (ohne `onCreate`, `isTaken` blendet A selbst aus) → Zusammenfassung „Alle N Abende und M Liga-Zeilen von „A“ gehen auf „B“ über. „A“ wird als anderer Name von „B“ gespeichert. Das lässt sich nicht automatisch rückgängig machen.“ → Knopf „Zusammenführen“ (destruktive Farbe).
     - „Löschen“ nur wenn `evenings === 0 && leagueRows.length === 0 && matches === 0`, mit Rückfrage.
  4. Nach jeder Aktion: Liste neu laden, `toast.success(...)`. Hinweis nach Zuordnen oder Zusammenführen: „Bitte in der betroffenen Liga die Prüfung „berechnet = gespeichert“ ansehen und bei Bedarf „Als neuen Stand übernehmen“.“
- Für viele Spieler (über 200): einfache Liste reicht; keine Virtualisierung nötig.

### 3.6 Tests Punkt 3

- `src/lib/__tests__/playerAdmin.test.ts`: `buildPlayerAdmin` zählt Abende, Partien (Heim und Gast, ein Spiel gegen sich selbst gibt es nicht), Liga-Zeilen mit Liganamen, Aliase; listet Liga-Zeilen ohne Spieler; Sortierung.
- Speicherschicht: in `storageRefs.test.ts` (oder neuer Datei mit kopiertem Test-Ersatz) das Ersatz-`supabase` um `rpc(name, args)` erweitern (Aufruf protokollieren, konfigurierbare Antwort/Fehler). Fälle: `renamePlayer` ruft `rename_player` mit den richtigen Argumenten; Fehler werden geworfen; `assignLeagueRow` schreibt nur Zeilen mit `player_ref IS NULL` (Filter `is` im Ersatz ergänzen).
- SQL-Tests 3.3.
- Browsertest `e2e/player-admin.mjs` (Muster: `e2e/player-picker.mjs`; der Ersatz-Server muss zusätzlich `POST /rest/v1/rpc/<name>` beantworten und die Wirkung von `rename_player`/`merge_players` im Speicher nachbilden). Fälle: Seite nur als Admin; Suche; Umbenennen (Name und Alias im Speicher); Zusammenführen (Verweise umgehängt, Quelle weg); Zusammenführen abgelehnt (Ersatz-Server antwortet mit der Exception) → Meldung sichtbar, nichts geändert; Löschen nur für unbenutzte; Zuordnen einer Liga-Zeile. Screenshots Desktop und 390 px dem Nutzer zeigen, **bevor** du den PR anlegst (der Nutzer möchte Entwürfe sehen).

### 3.7 Abnahme Punkt 3

1. Alle Tests grün, Mutationsproben (zum Beispiel in `merge_players` die Ligaprüfung entfernen → SQL-Fall 5 muss scheitern; in `buildPlayerAdmin` Gast-Partien nicht zählen → Unit-Test muss scheitern).
2. Probe: Migration, `scripts/test-player-admin.sql` grün, Fingerabdruck vorher = nachher.
3. 🛑 Freigabe des Nutzers für den Live-Schritt. Live: Vorab-Prüfung aus 3.2 (0), Fingerabdruck, Migration (`apply_migration`), Fingerabdruck identisch, `SELECT proname FROM pg_proc WHERE proname IN ('rename_player','merge_players')` liefert beide, Index vorhanden, `get_advisors` (security) ohne neue Warnung.
4. Dann mergen und Deployment prüfen (Vercel `READY`).

---

## 4. Liga-Übertragung schreibt nur geänderte Zeilen, löscht nie

**Branch:** `fix/league-write-changed-rows`. Keine Datenbankänderung.

### 4.1 Befund

`saveLeague(league)` in `storage.ts` schreibt **alle** Zeilen der übergebenen Liga und löscht Zeilen, die darin fehlen. Die Übertragung (`handleTransferResults` in `Training.tsx` und `SchweizSystem.tsx`) und die Ligenseite (`persistLeague` in `Leagues.tsx`) übergeben dabei die Liga aus dem **Browserzustand**. Ist ein zweites Gerät offen, das die Liga inzwischen geändert hat, überschreibt das erste Gerät diese Änderungen oder löscht sogar Zeilen, die das andere Gerät angelegt hat.

### 4.2 Ziel

- Jede Änderung schreibt **nur die Zeilen, die sie wirklich ändert**.
- **Gelöscht wird nur**, wenn der Admin auf der Ligenseite ausdrücklich „Spieler entfernen“ wählt, und dann genau diese eine Zeile.
- Die Übertragung rechnet auf einem **frisch geladenen** Stand der Liga, nicht auf dem Browserzustand.

### 4.3 Speicherschicht

Neue Funktionen in `storage.ts`:

```ts
/** One league with its rows, fresh from the database (same mapping and sorting as loadLeagues). */
export async function loadLeague(leagueId: string): Promise<League | null>

/** Writes the league itself (name, year, eternal flag), never its rows. */
export async function saveLeagueHeader(league: League): Promise<void>

/**
 * Writes the given rows of a league (insert or update), nothing else. A row is identified by player_id within the
 * league, as in saveLeague; the row id of an existing row is kept. Never deletes.
 */
export async function saveLeagueRows(league: League, rows: PlayerStats[]): Promise<void>

/** Deletes one row of a league (the admin removed the player). */
export async function deleteLeagueRow(leagueId: string, playerId: string): Promise<void>
```

- `saveLeagueRows` übernimmt aus `saveLeague` die Abbildung der Spalten (inklusive `player_ref` nur, wenn `schemaFeatures.playerRef` und bekannt) und die Suche nach der vorhandenen Zeilen-ID über `player_id`, aber **nur für die übergebenen Spieler** (`.in('player_id', ids)` statt alle Zeilen der Liga lesen). Geschrieben wird mit `upsertRows('player_stats', rows)` (Gruppen nach Schlüsseln, siehe Kommentar dort).
- `loadLeague` nutzt die vorhandene Abbildung `toLeague` und `sortRows`; am besten `loadLeagues` intern so umbauen, dass beide dieselbe Hilfsfunktion nutzen.
- **`saveLeague` entfernen**, wenn alle Aufrufer umgestellt sind (siehe 4.5). Falls ein Test ihn noch braucht, Test anpassen. Kein toter Code.

Reine Hilfsfunktion in `src/lib/leagueTransfer.ts`:

```ts
/** Rows of `after` that are new or differ from `before` (any number, the name or the identity). */
export function changedRows(before: League, after: League): PlayerStats[]
```
Vergleich über `player.id`; verglichen werden alle zehn Zahlenspalten, `player.name` und `player.ref`.

### 4.4 Übertragung (`Training.tsx` und `SchweizSystem.tsx`, `handleTransferResults`)

Heute: `updatedLeagues = leagues.map(l => targetIds.includes(l.id) ? applySessionToLeague(l, ...) : l)`, danach je Liga `saveLeague(league)`.

Neu, je Ziel-Liga der Reihe nach (die Schleife mit „nach jeder Liga als übertragen markieren“ bleibt genau so erhalten):

```ts
const fresh = await loadLeague(leagueId);           // aktueller Stand aus der Datenbank
if (!fresh) { toast.error(...); return; }
const updated = applySessionToLeague(fresh, stats, firstPlace, secondPlace, nameMatches.get(leagueId) ?? new Map());
await saveLeagueRows(updated, changedRows(fresh, updated));
// Browserzustand: die Liga durch `updated` ersetzen
```

- Fehler beim Laden oder Schreiben: dieselbe Meldung wie heute („Übertragung zu … fehlgeschlagen …“) und `return`, ohne die Liga als übertragen zu markieren.
- Der Dialog `TransferDialog` arbeitet weiter mit dem Browserzustand der Ligen (nur für die Fragen nach ähnlichen Namen). Das ist in Ordnung: Die Antworten sind Namen, keine Zahlen.

### 4.5 Ligenseite (`Leagues.tsx`)

`persistLeague(league)` entfällt. Die vier Aufrufer:
- **Liga anlegen** (`handleCreateLeague`): `saveLeagueHeader(newLeague)`.
- **Zeile bearbeiten** (`handleSaveEdit`, ruft heute `persistLeague(updatedLeague)`): nur die bearbeitete Zeile: `saveLeagueRows(selectedLeague, [bearbeiteteZeile])`.
- **Spieler entfernen** (`handleDeletePlayer`): `deleteLeagueRow(selectedLeague.id, playerId)`.
- **Spieler hinzufügen** (`handleAddPlayer`): `saveLeagueRows(selectedLeague, [newStat])`.
- Ebenso in `Training.tsx` und `SchweizSystem.tsx` `handleCreateLeague` → `saveLeagueHeader`.
- Nach jeder Änderung bleibt der Browserzustand wie heute aktualisiert. Zusätzlich: Nach dem Schreiben die Liga mit `loadLeague` neu laden und den Browserzustand damit ersetzen, damit Änderungen anderer Geräte sichtbar werden.

### 4.6 Tests Punkt 4

- `leagueTransfer.test.ts`: `changedRows` – unveränderte Liga → leer; geänderte Punkte → genau diese Zeile; neue Zeile → enthalten; nur Name geändert → enthalten; nur Identität ergänzt → enthalten.
- Speicherschicht (Test-Ersatz aus `storageRefs.test.ts`):
  1. `saveLeagueRows` schreibt nur die übergebenen Zeilen; andere Zeilen der Liga bleiben unverändert, **kein** `delete` im Protokoll.
  2. Vorhandene Zeilen-ID wird beibehalten (gleiche `id` nach dem Schreiben).
  3. `deleteLeagueRow` löscht genau eine Zeile dieser Liga, nicht dieselbe `player_id` in einer anderen Liga.
  4. `loadLeague` liefert die Zeilen sortiert wie `loadLeagues`.
- **Zwei-Geräte-Test** als Browsertest `e2e/two-devices.mjs` (Muster: `e2e/complete-evening.mjs`): Seite lädt die Liga; danach ändert der Test im Ersatz-Server eine Zeile eines Spielers, der am Abend **nicht** mitspielt (simuliert ein anderes Gerät), und legt eine neue Zeile an; dann Abend abschließen und übertragen. Erwartet: die fremde Änderung und die neue Zeile sind nach der Übertragung noch da; die Zeilen der Spieler des Abends haben die richtigen Summen; im Protokoll des Ersatz-Servers kein `DELETE player_stats`. **Gegenprobe:** derselbe Test mit dem alten Code (vor deiner Änderung, per `git stash`) muss scheitern – schreibe im PR, dass du das geprüft hast.
- Alle bestehenden Browsertests, besonders `complete-evening.mjs`, `dtkv-ranking.mjs`, `swiss-flow.mjs`, `name-matching.mjs`, `player-identity.mjs`, `league-check.mjs`. Die Ersatz-Server dieser Tests müssen `in`-Filter auf `player_id` verstehen (die meisten tun es schon über `matchFilter`).

---

## 5. Schweizer Turniere in der Ligenprüfung

**Branch:** `feat/league-check-swiss`. Keine Datenbankänderung. Voraussetzung: Punkt 2 ist gemergt.

### 5.1 Befund

`sessionResult` in `src/lib/leagueStandings.ts` wirft für `tournamentType === 'swiss'` einen Fehler; `checkLeague` lässt Schweizer Turniere deshalb weg und meldet „unvollständig“. Die Übertragung eines Turniers bucht aber `computeFinalSwissStats(SwissSession)` aus `swissHelpers.ts`. Für die Prüfung muss genau dieselbe Rechnung aus dem **gespeicherten** Abend (`TrainingSession` aus `loadHistory`) möglich sein.

Was im gespeicherten Abend steht:
- Vorrundenspiele: `matches` mit `phase = 'swiss'` (`getSwissMatches`), Runden über `round`.
- Playoff-Spiele: `phase = 'playoff'` (`getPlayoffFlatMatches`), mit `playoffRound`, `matchNumber`, `isBye`, `suddenDeath`; leere Plätze als Platzhalter (ID beginnt mit `PLAYOFF_PLACEHOLDER_PREFIX`, Name „–“).
- Das **Los** (`lot`) für völligen Gleichstand in der Vorrunde steht nur im Turnierstand `training_sessions.swiss_state` (JSON, Feld `lot`). Der Turnierstand bleibt nach dem Abschluss in der Zeile stehen (er wird beim Abschluss nicht gelöscht). Bei Turnieren, die nur im Browser liefen, fehlt er.
- Freilose geben im Schweizer System keine Punkte (`computeSwissStats` zählt nur gespielte Partien), wie `computeStats`.

### 5.2 Umsetzung

1. **Gemeinsamer Kern.** Neue Datei `src/lib/swissFinal.ts` mit einer reinen Funktion, die genau das tut, was `computeFinalSwissStats` heute tut (inklusive der Titelregel aus Punkt 2), aber aus Spielern und flachen Partien:
   ```ts
   export function finalSwissResult(
     players: Player[],
     groupMatches: Match[],      // phase 'swiss'
     playoffMatches: Match[],    // phase 'playoff', wie gespeichert (mit Platzhaltern)
     lot?: Record<string, number>,
   ): { stats: PlayerStats[]; championName?: string; viceChampionName?: string }
   ```
   - Vorrunde: `computeSwissStats(players, roundsOf(groupMatches), lot)` – dafür `roundsOf` in `src/lib/swissRanking.ts` exportieren.
   - Playoff-Zahlen wie heute addieren (nur beendete Spiele, keine Freilose, keine Platzhalter).
   - Titel und Sortierung wie heute bzw. wie nach Punkt 2. `sessionFinalRanking` erwartet eine `TrainingSession`; baue dafür intern ein minimales Objekt (`{ ..., tournamentType: 'swiss', players, matches: [...groupMatches, ...playoffMatches] }`) oder ziehe die benötigte Logik (`finalRankingSwiss(players, groupMatches, playoff, order)` aus `ranking.ts`) direkt heran. Entscheide dich für das Einfachere, aber **ohne** Verhalten zu ändern.
2. **`computeFinalSwissStats` wird zur dünnen Hülle:** `convertSwissToTrainingSession(s)` liefert die flachen Partien; dann `finalSwissResult(s.players, getSwissMatches(ts.matches), getPlayoffFlatMatches(ts.matches), s.lot)`.
3. **Charakterisierung zuerst:** Bevor du (1) und (2) baust, schreibe Tests, die für mindestens vier von Hand gebaute Turniere die heutigen Ergebnisse von `computeFinalSwissStats` festhalten (alle Zahlen jeder Zeile, Reihenfolge, Meister, Vize): ohne Playoff; mit Viertel-, Halbfinale und Finale; mit Sudden Death im Playoff; mit Schiedsrichter-Modus und ungerader Spielerzahl (Freilos). Diese Tests müssen nach dem Umbau **unverändert** grün sein.
4. **Los aus dem Turnierstand:** `TrainingSession` (`src/types/index.ts`) bekommt ein optionales Feld `swissLot?: Record<string, number>`. In `storage.ts`, `toSession`: wenn `row.swiss_state?.lot` ein Objekt ist, `swissLot` setzen. (Nur lesen; geschrieben wird es nie aus diesem Feld.)
5. **`sessionResult` für Schweizer Turniere:**
   ```ts
   if (session.tournamentType === 'swiss') {
     const r = finalSwissResult(session.players, getSwissMatches(session.matches), getPlayoffFlatMatches(session.matches), session.swissLot);
     return { stats: r.stats, firstPlace: r.championName, secondPlace: r.viceChampionName };
   }
   ```
6. **`checkLeague`:** Schweizer Turniere nicht mehr herausfiltern. Das Feld `unsupported` bleibt im Ergebnis, ist aber nur noch für Turniere gefüllt, bei denen kein Los vorliegt **und** in der Vorrunde völliger Gleichstand an einer für die Titel relevanten Stelle besteht – das ist selten. Einfachere, ebenfalls zulässige Variante: `unsupported` entfernen und in `LeagueCheckCard` den Text „Schweizer Turniere werden noch nicht mitgerechnet“ entfernen; dann im PR erwähnen, dass bei fehlendem Los ein völliger Gleichstand theoretisch eine Abweichung anzeigen kann. Wähle die einfachere Variante.
7. `openingsFor` ebenso ohne Filter.

### 5.3 Tests Punkt 5

- Charakterisierungstests aus 5.2 (3).
- **Eigenschaftstest „Übertragung = Prüfung“** in `src/lib/__tests__/leagueCheck.test.ts`: für mehrere Turniere (von Hand gebaut oder mit der Auslosung `generateSwissRoundMatches` und festen Zufallszahlen erzeugt) gilt:
  ```
  gespeicherte Liga = applySessionToLeague(leere Liga, computeFinalSwissStats(s).stats, champion, vice)
  checkLeague(gespeicherte Liga, [convertSwissToTrainingSession(s) mit isCompleted und swissLot = s.lot], leerer Startbestand).ok === true
  ```
  einmal für eine normale Liga und einmal für die Ewige Tabelle. Die Spieler brauchen dafür eine Identität (`ref`), sonst werden ihre Zeilen nicht geprüft.
- Ein Fall mit a.K.-Spieler, der das Turnier gewinnt: Prüfung `ok` (Titel gehen in beiden Rechnungen an den Nachrücker).
- `leagueStandings.test.ts`: den Test „refuses a Swiss tournament“ ersetzen durch einen, der die Zahlen eines kleinen Turniers prüft.
- Mutationsproben: in `finalSwissResult` Playoff-Spiele nicht addieren → Charakterisierung und Eigenschaftstest scheitern; Los ignorieren → Charakterisierung eines Turniers mit Gleichstand scheitert (baue dafür einen Fall mit völligem Gleichstand in der Vorrunde).
- Browsertests `swiss-flow.mjs` und `league-check.mjs` unverändert grün.

---

## 6. Dokumentationsseite der App aktualisieren

**Branch:** `docs/app-documentation`. Keine Datenbankänderung. Am besten zuletzt, damit alles beschrieben ist, was es gibt.

### 6.1 Befund

`src/pages/Dokumentation.tsx`, Liste `sections` (ab etwa Zeile 197), ist veraltet. Neue Funktionen fehlen, einige Texte stimmen nicht mehr (zum Beispiel „Ewige Tabelle … Siege, Niederlagen, Tordifferenz“; die Ewige Tabelle zeigt Punkte, Gegenpunkte und Meistertitel).

### 6.2 Änderungen an `sections`

Status-Werte: `'Aktiv'`, `'Neu'` (für alles aus diesem Plan und den Schritten B bis E), `'In Planung'`. Texte so übernehmen oder sinngemäß, kurz halten (eine Karte = zwei bis drei Sätze):

**Kernfunktionen**
- *Trainingsabende* (bleibt), ergänzen: „Der Abend wird laufend in der Datenbank gespeichert; bei Verbindungsproblemen bleiben Eingaben im Browser gesichert.“
- *Paarungsgenerator* (bleibt).
- *Tagestabelle*, Text ersetzen: „Zeigt die Rangliste des Abends nach der DTKV-Spielordnung 2026: Punkte, dann direkter Vergleich bzw. Untergruppe, dann Tore. Bei völligem Gleichstand um Platz 1 oder 2 fragt die App nach dem Ergebnis eines Entscheidungsspiels.“ Status `Neu`.
- **Neu:** *Schweizer System* – „Turnier mit Vorrunde ohne Wiederholungspaarung, Freilos bei ungerader Spielerzahl, optional Schiedsrichter-Modus (der Spieler mit Freilos pfeift im anderen Durchgang) und Playoff ohne Unentschieden (Sudden Death). Der Turnierstand wird in der Datenbank gespeichert.“
- **Neu:** *Spielereingabe mit Spielerliste* – „Beim Tippen schlägt die App bekannte Spieler vor. Ein unbekannter Name wird erst nach Rückfrage angelegt, mit Hinweis auf ähnliche Namen.“
- *Training zurücksetzen* (bleibt).

**Ligen & Tabellen**
- *Ligenverwaltung* (bleibt), ergänzen: „Spieler werden über die Spielerliste hinzugefügt.“
- *Transfer zur Ewigen Tabelle* → umbenennen in *Übertragung in Ligen*: „Überträgt die Ergebnisse eines Abends oder Turniers in eine oder mehrere Ligen. Dieselbe Person wird an ihrer festen Identität erkannt; bei ähnlichen Namen ohne Identität fragt die App nach. Spieler „außer Konkurrenz“ (Name endet auf „a.K.“) bekommen keinen Titel, der Nächste rückt nach.“ Status `Neu`.
- *Ewige Tabelle*, Text ersetzen: „Die allzeitige Rangliste: Punkte, Gegenpunkte und Meistertitel, sortiert nach Punkten, dann Meistertiteln.“
- **Neu:** *Prüfung „berechnet = gespeichert“* – „Admins können je Liga nachrechnen lassen, ob die gespeicherte Tabelle zu Startbestand und übertragenen Abenden passt. Abweichungen werden mit Spieler und Spalte angezeigt.“
- *Meisterschafts-Highlights* (bleibt `In Planung`).

**Historie & Auswertung**
- *Statistiken*, ergänzen: „Dieselbe Person wird über alle Schreibweisen hinweg gezählt.“
- Übrige bleiben.
- **Neu:** *Abschlussrangliste Schweizer System* – „Nach SO § 9 Abs. 6: nach Ausscheiderunde, dann Punkten; Sudden-Death-Spiele zählen 1,5 zu 0,5.“

**Benutzerverwaltung & Sicherheit**
- *Spielerverwaltung*, Text ersetzen: „Admins pflegen die Spielerliste: umbenennen (der alte Name bleibt als anderer Name erhalten), doppelt angelegte Spieler zusammenführen, ungenutzte löschen und Liga-Zeilen ohne Spieler zuordnen.“ Status `Neu` (setzt Punkt 3 voraus).
- **Neu:** *Datensicherung* – „Alle Tabellen werden am 1. und 15. jedes Monats gesichert; eine Wiederherstellung prüft die Sicherung vorher und löscht nie etwas.“
- *Rollen & Berechtigungen* bleibt `In Planung`.

**In Entwicklung** – unverändert.

### 6.3 Live-Previews

- `PlayerInputDemo` bleibt (ohne Spielerliste, freie Eingabe). Den `hint` lassen wie er ist (er erwähnt die Spielerliste bereits).
- Keine neuen Previews nötig.

### 6.4 Tests Punkt 6

- `npm run typecheck`, `npx vitest run`, Build.
- `node e2e/csp-e2e.mjs` (alle Seiten und Exporte unter der echten CSP) muss grün sein.
- Screenshot der Seite (Desktop und 390 px) dem Nutzer zeigen.
- Kein Vereinsname in den Texten.

---

## 7. Was danach beim Nutzer bleibt

Nicht Teil dieses Plans, aber am Ende jedes PRs bzw. am Schluss erinnern:
1. Die doppelten Zeilen der Ewigen Tabelle von Hand bereinigen und danach auf der neuen Seite „Spielerliste“ zuordnen; anschließend in der Ligenprüfung „Als neuen Stand übernehmen“.
2. Entscheidung zum Admin-Kennzeichen (alter Plan, Abschnitt 11).
3. Supabase-Dashboard: „Leaked Password Protection“ einschalten (Authentication → Policies/Passwords).
4. GitHub: offenen Dependabot-Hinweis im App-Repository ansehen (Security → Dependabot).
5. Gemergte Branches löschen.
