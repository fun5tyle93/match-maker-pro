# Umsetzungsplan Match Maker Pro

Dieser Plan ist für die Umsetzung durch Claude (Sonnet) in einer späteren Sitzung geschrieben. Er ist absichtlich ausführlich: Lies ihn ganz, bevor du anfängst, und arbeite die Schritte in der angegebenen Reihenfolge ab.

**Die zwei wichtigsten Ziele des Nutzers:**

1. **Es dürfen keine Daten verloren gehen.** Kein Abend, kein Ergebnis, kein Ligastand, kein Meistertitel.
2. **Das Schweizer System muss danach fehlerfrei funktionieren.** In der Vorrunde eines Turniers spielt jedes Paar **höchstens einmal** gegeneinander. Im Playoff darf es wieder zur Begegnung kommen.

3. **Die Wertung bei Gleichstand folgt der DTKV-Spielordnung 2026** (Abschnitt 6, Schritt W). Wo die Spielordnung nichts regelt, gelten die dort ergänzten Vereinsregeln.

Wenn eine Anweisung in diesem Plan mit diesen Zielen kollidiert, gewinnen die Ziele. Halte dann an und frage den Nutzer.

---

## Inhalt

1. [So arbeitest du mit diesem Plan](#1-so-arbeitest-du-mit-diesem-plan)
2. [Die Regeln gegen Datenverlust](#2-die-regeln-gegen-datenverlust)
3. [Projektkontext und Umgebung](#3-projektkontext-und-umgebung)
4. [Werkzeuge](#4-werkzeuge)
5. [Schritt A: Sicherheitsnetz und Hygiene](#5-schritt-a-sicherheitsnetz-und-hygiene)
6. [Schritt W: Wertung nach DTKV-Spielordnung](#6-schritt-w-wertung-nach-dtkv-spielordnung)
7. [Schritt B: Schweizer System neu](#7-schritt-b-schweizer-system-neu)
8. [Schritt C: Doppelte Spielerzeilen bereinigen](#8-schritt-c-doppelte-spielerzeilen-bereinigen)
9. [Schritt D: Feste Spieler-Identität (später)](#9-schritt-d-feste-spieler-identität-später)
10. [Schritt E: Ligen aus den Abenden berechnen (später)](#10-schritt-e-ligen-aus-den-abenden-berechnen-später)
11. [Entscheidungen des Nutzers](#11-entscheidungen-des-nutzers)
12. [Anhang: Befunde mit Belegen](#12-anhang-befunde-mit-belegen)

**Reihenfolge:** A → W → B → C. D und E folgen erst nach Rücksprache mit dem Nutzer, siehe 11.

---

## 1. So arbeitest du mit diesem Plan

- **Ein Schritt = ein Branch = ein Pull Request.** Branch-Namen: `feat/swiss-rewrite`, `chore/safety-net` usw. Nie direkt auf `main` pushen.
- **Der Nutzer merged nicht selbst.** Er prüft die Vercel-Vorschau und schreibt „mergen“ (oder „Preview geprüft, du kannst mergen“). Erst dann mergst du per REST:
  `gh api repos/fun5tyle93/match-maker-pro/pulls/<N>/merge -X PUT -f merge_method=merge -f commit_title="<Titel> (#<N>)"`
- **PR anlegen nur per REST** (GraphQL ist durch den Proxy blockiert):
  `gh api repos/fun5tyle93/match-maker-pro/pulls -f title=... -f head=<branch> -f base=main -F body=@<datei>`
- **Branches löschen geht nicht** (Proxy). Sag dem Nutzer am Ende, welche gemergten Branches er auf GitHub löschen soll.
- **Kommunikation auf Deutsch.** UI-Texte auf Deutsch, Code-Kommentare und Commit-Nachrichten auf Englisch (wie im bestehenden Code).
- **Stopp-Punkte:** An den mit 🛑 markierten Stellen hältst du an und holst die ausdrückliche Zustimmung des Nutzers ein. Ohne „ja“ geht es nicht weiter.
- **Berichte ehrlich.** Was du nicht testen konntest, sagst du. Was fehlschlug, zeigst du.

---

## 2. Die Regeln gegen Datenverlust

Diese Regeln gelten für jede Änderung an der Datenbank. Keine Ausnahme ohne 🛑 Zustimmung.

1. **Live-Datenbank nur lesen, außer bei freigegebenen Migrationen.** Mit `mcp__Supabase__execute_sql` sind auf `swuwjjmspplzfguapvty` nur `SELECT`-Abfragen erlaubt. Schemaänderungen laufen ausschließlich über `mcp__Supabase__apply_migration`, und zwar erst nach 🛑 Zustimmung zu genau dieser Migration.
2. **Vor jeder Migration ein frisches Backup.** Der Nutzer startet im Repo `fun5tyle93/backup-TKMatchmaker` unter Actions → „Supabase-Backup“ → „Run workflow“. Danach klonst du das Backup und prüfst, dass die Zeilenzahlen der JSON-Dateien mit den Live-Zahlen übereinstimmen (Abschnitt „rows“ des Fingerabdrucks, siehe 4.2). Stimmen sie nicht, keine Migration.
3. **Jede Migration zuerst an der Probe-Datenbank** (4.1) mit dem frischen Backup. Erst wenn sie dort fehlerfrei läuft und der Fingerabdruck stimmt, darf sie live laufen.
4. **Nur additive Migrationen** („expand/contract“): neue Tabellen, neue Spalten (nullable oder mit Default), neue Indizes, neue Constraints, neue Funktionen. **Verboten** ohne 🛑: `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`, `TRUNCATE`, `DELETE`, `UPDATE` auf bestehende Daten. Alte Spalten und Tabellen bleiben stehen, auch wenn sie nicht mehr gelesen werden.
5. **Fingerabdruck vorher und nachher.** Führe `scripts/db-invariants.sql` vor und nach jeder Live-Migration aus und vergleiche. Eine Migration, die keine Daten ändern soll, muss eine identische Ausgabe liefern. Unterschiede erklärst du dem Nutzer, bevor du weitermachst.
6. **Erst Migration, dann App.** Die neue Spalte oder Tabelle muss live existieren, bevor eine App-Version ausgeliefert wird, die sie benutzt. Die App muss außerdem mit dem alten Schema weiter funktionieren, solange die Migration nicht live ist (zum Beispiel für die Vercel-Vorschau vor dem Merge). Liest die App eine neue Spalte, die fehlt, muss sie sauber auf das alte Verhalten zurückfallen.
7. **Migrationsdateien ins Repo.** Jede Migration liegt als `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` im PR, und zwar mit genau dem SQL, das du mit `apply_migration` ausführst.
8. **Nichts automatisch zusammenführen, was Menschen entscheiden müssen.** Namen zusammenlegen, Spieler zuordnen, Wertungsregeln ändern: Das entscheidet der Nutzer.
9. **Keine Migration, während ein Training oder Turnier läuft.** Prüfe vorher: `SELECT session_id FROM current_session` muss `null` sein, und es darf keinen offenen Abend geben (`SELECT count(*) FROM training_sessions WHERE NOT is_completed` = 0). Frag den Nutzer außerdem, ob gerade jemand die App benutzt.
10. **Rückweg vorher aufschreiben.** Jeder PR mit Migration enthält im Text einen Abschnitt „Rückweg“: Wie wird der alte Zustand wiederhergestellt, wenn etwas schiefgeht? Bei additiven Migrationen heißt das meist: App-Version zurückrollen (Vercel → Deployments → älteres Deployment „Promote“). Bei Datenänderungen heißt das: Wiederherstellung aus dem Backup mit `restore.mjs` aus dem Backup-Repo.

---

## 3. Projektkontext und Umgebung

### 3.1 Was die App ist

Vereins-App „Match Maker Pro“ des TKC71 Hirschlanden (Tipp-Kick). Funktionen:

- **Training:** Trainingsabende im Rundenmodus (jeder gegen jeden)
- **Ligen:** Jahrestabellen und die „Ewige Tabelle“
- **Historie:** abgeschlossene Abende
- **Statistiken**
- **Schweizer System** mit optionalem Playoff
- **Exporte** als PDF und Excel

Es gibt einen einzigen Admin, die Registrierung ist abgeschaltet. Lesen ist öffentlich.

### 3.2 Stack und wichtige Orte

| Was | Wo |
|---|---|
| Repo | `fun5tyle93/match-maker-pro`, Standard-Branch `main` |
| Hosting | Vercel, Projekt `prj_drUZwCVyzlx1KIz27r1oANwJorej`, Team `team_kD9aCA9lVgsoNuAtPmK9hswl`. Jeder Push auf `main` geht live auf https://match-maker-pro.vercel.app, jeder PR bekommt eine Vorschau |
| Datenbank | Supabase-Projekt `swuwjjmspplzfguapvty` (Free-Plan: keine automatischen Backups, kein Branching) |
| Backup | privates Repo `fun5tyle93/backup-TKMatchmaker`: `data/*.json`, `restore.mjs`, `RESTORE.md`, Workflows `backup.yml` (1. und 15. des Monats) und `watchdog.yml` |
| Frontend | Vite 8, React 18, TypeScript 5.9, Tailwind 3, shadcn/ui, react-router 7, sonner (Toasts), Vitest 5, Playwright für Browsertests |
| Datenzugriff | `src/lib/storage.ts`. Jeder DB-Fehler wird geworfen, Schreibvorgänge laufen über `serialized()` nacheinander |
| Autosave Training | `src/hooks/useSessionAutosave.ts` und `src/lib/saveQueue.ts` (Warteschlange mit Wiederholung, Browser-Sicherung, `closeSession` vor dem Abschluss) |
| Schweizer System | `src/pages/SchweizSystem.tsx` (UI und Zustand), `src/lib/swissPairing.ts` (Auslosung, Playoff), `src/pages/swissHelpers.ts` (Umwandlung in TrainingSession, Endstand), `src/types/swiss.ts` |
| Rundenmodus | `src/lib/pairingGenerator.ts` (Kreismethode, Plattenzuteilung, `calculatePlayerStats`) |
| Exporte | `src/lib/exportPdf.ts`, `exportXlsx.ts`, `exportShared.ts`, `exportActions.ts` |
| Sicherheits-Header | `vercel.json` (CSP!). Neue externe Hosts müssen dort freigegeben werden, sonst blockiert der Browser sie |

### 3.3 Fallstricke dieser Umgebung (bereits erlebt)

- `npm install` und `npm ci` nur mit `--legacy-peer-deps` (npm-Peer-Konflikt).
- `vite preview` mit `--host 127.0.0.1 --port 4173 --strictPort` starten. Die Konfiguration bindet `::`, das scheitert hier mit `EAFNOSUPPORT`.
- **Nie `pkill -f "vite preview"`.** Das trifft die eigene Shell (Exit 144). Prozesse gezielt über `/proc/<pid>/cmdline` suchen und per PID beenden, zum Beispiel mit einem kleinen Python-Skript, dessen eigene Kommandozeile das Suchwort nicht enthält.
- Playwright liegt unter `/opt/node-tools/node_modules/playwright`, Chromium unter `/opt/pw-browsers/chromium`. Starten mit `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })`. Nicht `playwright install` ausführen.
- Port 4190 ist für `fetch` in Node gesperrt („bad port“). Für Mock-Server andere Ports nehmen, zum Beispiel 38190.
- Ein Mock-Server im selben Prozess wie `spawnSync` blockiert sich selbst. Nimm `spawn` mit `await`.
- postgrest-js wiederholt fehlgeschlagene GET-Anfragen automatisch. Fehler-Tests müssen deshalb dauerhaft blockieren.
- Die Supabase-MCP-Ausgabe von `execute_sql` mit mehreren Statements liefert oft nur das letzte Ergebnis. Schick lieber ein Statement pro Aufruf.
- jsPDF-Methoden hängen an der Instanz. Texte, die in `createStyledPDF` gezeichnet werden, erfasst ein nachträglich angehängter Recorder nicht. Zeichne deshalb die Argumente auf (siehe `exportPdf.test.ts`).
- Baseline: `npm run lint` meldet 20 Fehler und 7 Warnungen, überwiegend `no-explicit-any`. Die Zahl darf nicht steigen.
- Commits enden mit den Attributionszeilen, die dir die Sitzung vorgibt. Keine Modellnamen in Commits oder PRs.

---

## 4. Werkzeuge

### 4.1 Probe-Datenbank: `scripts/db-rehearsal.sh`

Dieses Skript startet einen lokalen PostgreSQL 16 mit den Daten aus dem Backup. Es ist getestet: Das lokal nachgebaute Schema war identisch mit dem Live-Schema (Spalten, Constraints, Indizes, Policies), und alle 6 Tabellen ließen sich laden.

```bash
# Backup holen (vorher hat der Nutzer den Backup-Workflow gestartet)
git clone --depth 1 https://github.com/fun5tyle93/backup-tkmatchmaker /home/user/backup-tkmatchmaker   # Repo vorher mit add_repo anhängen
# Probe-DB mit allen bestehenden Migrationen und den Backup-Daten
scripts/db-rehearsal.sh /home/user/backup-tkmatchmaker/data
# … plus die neue Migration, die du testen willst:
scripts/db-rehearsal.sh /home/user/backup-tkmatchmaker/data supabase/migrations/2026XXXXXXXXXX_neu.sql
# Verbinden (als root über den postgres-Benutzer):
su postgres -s /bin/bash -c "psql -h /var/tmp/mm-pg -p 54329 -U postgres"
# Stoppen:
scripts/db-rehearsal.sh --stop
```

Hinweise:
- **Ablage:** Die Daten liegen in `/var/tmp/mm-pg`, weil der Benutzer `postgres` das Scratchpad-Verzeichnis nicht betreten darf.
- **Supabase-Nachbau:** Die Rollen `anon` und `authenticated` sowie `auth.role()` und `auth.uid()` werden nachgebildet. RLS-Policies kannst du testen mit `SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false);`.
- **Neustart:** Nach einem Neustart der Sitzung läuft der Server nicht mehr. Dann einfach das Skript erneut ausführen.

### 4.2 Daten-Fingerabdruck: `scripts/db-invariants.sql`

Das Skript ist nur lesend. Es gibt pro Tabelle die Zeilenzahl aus, pro Liga die Summen aller Spalten samt Prüfsumme der Namen und Werte, und pro Abend Spieler, Spiele, Tore und eine Prüfsumme aller Ergebnisse.

- **Live:** den Inhalt der Datei mit `execute_sql` ausführen, die Ausgabe in einer Datei im Scratchpad speichern (`before.txt`, `after.txt`) und mit `diff` vergleichen.
- **Probe:** `psql ... -tA -f scripts/db-invariants.sql > before.txt`. Die Datei muss dafür für den Benutzer `postgres` lesbar sein, also nach `/var/tmp/mm-pg/` kopieren.

### 4.3 Tests

- **Unit-Tests:** `npx vitest run` (zurzeit 125 Tests). Neue Logik bekommt Tests. Prüfe, dass ein Test anschlägt, wenn du die Logik absichtlich kaputt machst (Mutation), und stell sie danach wieder her.
- **Browsertests:** Vorlagen liegen in `e2e/` (siehe `e2e/README.md`). Sie mocken Supabase über `context.route('https://swuwjjmspplzfguapvty.supabase.co/**', …)`. Den Admin-Login simulieren sie, indem sie unter dem Schlüssel `sb-swuwjjmspplzfguapvty-auth-token` eine Session mit einem künstlichen JWT in den `localStorage` legen. `e2e/complete-evening.mjs` hat einen zustandsbehafteten Mock, der Upserts, Filter und Deletes nachbildet. Nimm ihn als Vorlage für Speichertests.
- **Ablauf:** `npm run build`, dann `npx vite preview --host 127.0.0.1 --port 4173 --strictPort &`, dann `node e2e/<skript>.mjs http://127.0.0.1:4173`.

### 4.4 Prototyp der Swiss-Auslosung: `scripts/swiss-pairing-prototype.mjs`

Das ist eine lauffähige Referenz des Algorithmus aus Schritt B, inklusive Simulation (`node scripts/swiss-pairing-prototype.mjs`). Ergebnis bei 4 bis 20 Spielern, jeweils bis zur maximalen Rundenzahl: **0 Wiederholungen, 0 Fälle, in denen sich nicht auslosen ließ**. Die langsamste Runde brauchte 0,6 s (20 Spieler, 19 Runden), sonst meist unter 10 ms. Übersetze ihn nach TypeScript, statt einen neuen Algorithmus zu erfinden.

### 4.5 Referenz der DTKV-Wertung: `scripts/dtkv-ranking-reference.mjs`

Das ist eine lauffähige Referenz von SO § 8 Abs. 3 (Fälle 1 bis 6 aus 6.1) und SO § 9 Abs. 6 (Fall 7 aus 6.8, Abschlussrangliste mit halben Punkten nach Sudden Death) (`node scripts/dtkv-ranking-reference.mjs`). Mit einem Backup-Ordner als Argument vergleicht das Skript jeden gespeicherten Abend zwischen alter und neuer Wertung. Übersetze `rankGroup` nach TypeScript und prüfe deine Umsetzung gegen dieses Skript, zum Beispiel mit denselben Fällen und zufälligen Abenden, die beide Implementierungen gleich ordnen müssen.

---

## 5. Schritt A: Sicherheitsnetz und Hygiene

**Branch:** `chore/safety-net`. Keine Datenbankänderung.

1. **`package.json` → `scripts`:**
   - `"test": "vitest run"`
   - `"typecheck": "tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit"`
2. **TypeScript streng machen:** In `tsconfig.app.json` `"strict": true` setzen und `noImplicitAny: false` entfernen. Das Gleiche für `strictNullChecks` in `tsconfig.json`. Zurzeit gibt es dann genau einen Fehler: `src/pages/swissHelpers.ts:117` (`string | undefined` nach `string`). Behebe ihn sauber, also nicht mit `!` oder `as`, sondern indem du den Typ von `viceChampionName` korrekt als optional führst.
3. **CI:** `.github/workflows/ci.yml` für `pull_request` und `push` auf `main`:
   `actions/checkout@v4` → `actions/setup-node@v4` (Node 24, Cache npm) → `npm ci --legacy-peer-deps` → `npm run typecheck` → `npm test` → `npm run build`.
   Lint noch **nicht** als Pflicht (Baseline-Fehler). Prüfe in deiner Sitzung, ob GitHub Actions im Repo erlaubt sind. Laufen kannst du die CI erst, wenn der PR existiert.
4. **Toter Code entfernen:**
   - `src/lib/seedLeague2026.ts` wird nicht mehr importiert (nur noch ein Kommentar in `main.tsx`). Datei löschen und den Kommentar anpassen. Die Daten liegen in der Datenbank, im Backup und in der Git-Historie.
   - Den Typ `ChangeLogEntry` in `src/types/index.ts` entfernen, er wird nirgends benutzt.
5. **Browsertests ins CI?** Nicht in diesem Schritt. Sie brauchen Chromium. Sie bleiben manuelle Skripte in `e2e/`.

**Abnahme:**
- Typecheck, Tests und Build sind grün.
- Die CI läuft im PR grün.
- Die App verhält sich unverändert, Browsertests als Stichprobe.

---

## 6. Schritt W: Wertung nach DTKV-Spielordnung

**Branch:** `feat/dtkv-ranking`. Enthält eine additive Migration (6.9).

> **Umsetzungsstand (Schritt A am 12.11.2026 gemerged, Schritt W im Pull Request):** Die Wertung steckt in `src/lib/ranking.ts` (Abend, Liga, Ewige Tabelle, Abschlussrangliste) und `src/lib/swissRanking.ts` (`rankSession`, `sessionFinalRanking`). Die Migration liegt als `supabase/migrations/20261112200000_ranking_rule.sql` im PR und ist erst nach Zustimmung des Nutzers live angewendet. Tests: `ranking.test.ts`, `swissRanking.test.ts`, `storageSchema.test.ts`, `e2e/dtkv-ranking.mjs`.

**Quellen:** DTKV-Spielordnung, Stand 24. März 2026 („SO“), und DTKV-Spielregeln 2025. Der Nutzer hat beide Dokumente bereitgestellt. Maßgeblich sind:
- **SO § 8 Abs. 2:** Punkteverteilung im Turnier. Sieg 2:0, Unentschieden 1:1, Niederlage 0:2. Das entspricht dem heutigen Code.
- **SO § 8 Abs. 3:** Punktgleichheit innerhalb einer Gruppe.
- **SO § 8 Abs. 4, § 9 Abs. 1 bis 3:** K.-o.-Spiele, Entscheidungsspiele, Finale.
- **SO § 2 Abs. 6:** Platzierung in der Einzelwertung einer Liga.

Ein Trainingsabend im Rundenmodus ist eine Gruppe im Sinne von SO § 8. Die Jahrestabelle ist eine Einzelwertung über viele Abende und wird analog zu SO § 2 Abs. 6 behandelt.

### 6.1 Abend im Rundenmodus: SO § 8 Abs. 3 (verbindlich)

Wörtlicher Kern der Regel: „Sind zwei Spieler innerhalb einer Gruppe (Hauptgruppe) punktgleich, wird zuerst der direkte Vergleich herangezogen. Endete dieser unentschieden, zählt zuerst die höhere Tordifferenz und nur bei Gleichheit die Anzahl der mehr geschossenen Tore in der Hauptgruppe. Sind drei oder mehr Spieler punktgleich, bilden diese eine eigene Untergruppe, deren Punkte und Torverhältnisse neu errechnet werden; die Platzierung erfolgt zuerst nach Punkten in der Untergruppe. Sind wiederum Spieler punktgleich, bilden diese eine Unteruntergruppe (zwei Spieler: direkter Vergleich). Ist dann keine eindeutige Platzierung möglich, gilt das Torverhältnis aller Betroffenen in der nächst höheren Gruppe, danach in der Hauptgruppe. Ist auch dann keine eindeutige Platzierung möglich, gibt es ein Entscheidungsspiel (bei mehr als zwei Spielern eine Entscheidungsrunde).“

**Algorithmus** (Referenz: `scripts/dtkv-ranking-reference.mjs`, Funktion `rankGroup`):

```
rang(Menge M, Vorfahren V):            // V = übergeordnete Gruppen, nächste zuerst, Hauptgruppe zuletzt
  Punkte nur aus den Spielen innerhalb von M berechnen; nach Punkten absteigend in Blöcke gruppieren
  für jeden Block B:
    |B| = 1            → fertig
    |B| < |M|          → rang(B, [M, ...V])           // Untergruppe; bei zwei Spielern = direkter Vergleich
    |B| = |M|          → Punkte trennen hier nicht mehr:
                         sortiere B nach (Tordifferenz, geschossene Tore) in V[0], dann in V[1], … bis zur Hauptgruppe
                         (hat M keine Vorfahren, ist M die Hauptgruppe: deren eigene Tore)
                         wer danach noch völlig gleich ist, bleibt ein Gleichstand-Block
Ergebnis = rang(alle Spieler des Abends, [])
```

**Auslegungen** (im Code als Kommentar dokumentieren):
- **„Torverhältnis“:** Darunter wird hier, wie in Satz 2 der Regel, erst die Tordifferenz und dann die Zahl der geschossenen Tore verstanden.
- **Teilweise Trennung über Tore:** Trennen die Tore in einer übergeordneten Gruppe nur einen Teil der Gleichen, wird für den Rest keine neue Untergruppe gebildet. Es geht in der Kette weiter zur nächsten übergeordneten Gruppe. Die Regel sieht die Neubildung nur nach Punkten vor.
- **Mehrfache Begegnungen:** Bei Hin- und Rückrunde (`matchesPerPairing` > 1) zählen für den direkten Vergleich alle Spiele der beiden gegeneinander.
- **Wertung zählt nur die Vorrunde:** Gewertet werden nur abgeschlossene Spiele mit Ergebnis der Gruppe, also nicht Playoff und nicht Entscheidungsspiele.

**Pflicht-Testfälle** (`npm test`; sie stehen auch im Referenzskript, `node scripts/dtkv-ranking-reference.mjs` muss 7× OK ausgeben (Fälle 1 bis 6 hier, Fall 7 in 6.8)):

| Fall | Spiele (Heim-Gast Tore) | Erwartet nach DTKV | Alte App |
|---|---|---|---|
| 1 Direkter Vergleich schlägt Tordifferenz | A-B 1:0, C-A 1:0, A-D 1:0, B-C 9:0, B-D 9:0, D-C 1:0 | A > B > D > C | B > A > D > C |
| 2 Direkter Vergleich unentschieden | A-B 2:2, A-C 3:0, B-C 1:0 | A > B > C | gleich |
| 3 Drei im Kreis | A-B 1:0, B-C 1:0, C-A 1:0, A-D 5:0, B-D 3:0, C-D 1:0 | A > B > C > D | gleich |
| 4 Zwei punktgleiche Paare | A-B 3:0, A-C 3:0, B-C 0:1, D-A 1:0, B-D 1:0, C-D 1:0 | A > C > B > D | A > C > D > B |
| 5 Völlige Gleichheit | A-B 2:2 | A = B (Gleichstand) | A > B |
| 6 Tore der Untergruppe vor Hauptgruppe | A-B 1:0, A-C 5:0, B-C 0:0, D-A 1:0, E-A 1:0, B-D 1:0, B-E 1:1, C-D 9:0, C-E 0:0, D-E 0:0 | E > A > B > C > D | E > C > A > B > D |

Zusätzlich gelten zufallsbasierte Eigenschaftstests: Die Reihenfolge hängt nicht von der Reihenfolge der Spieler- und Spieleliste ab. Mische beide und vergleiche das Ergebnis.

### 6.2 Völliger Gleichstand am Abend (Vereinsregel, ergänzt)

Die SO sieht ein Entscheidungsspiel nur vor, wenn es um die Qualifikation für die nächste Runde geht (§ 8 Abs. 3 Satz 14). Bei eindeutig Ausgeschiedenen verzichtet sie ausdrücklich darauf (Satz 15). Für den **Tagessieg und den Vize** eines Trainingsabends gibt es keine Regel, obwohl beide als Meister- und Vizetitel in die Jahrestabellen eingehen. **Ergänzte Regel:**

- **Platz 1 oder 2 betroffen:** Bleibt nach 6.1 ein Gleichstand, der Platz 1 oder Platz 2 berührt, wird ein Entscheidungsspiel ausgetragen, bei mehr als zwei Spielern eine Entscheidungsrunde. Es gilt der K.-o.-Modus mit Sudden Death (SO § 8 Abs. 4, § 9 Abs. 2).
  - **Eintragen:** Beim Klick auf „Training abschließen“ erscheint ein Dialog „Gleichstand um Platz X – Entscheidungsspiel“, in dem der Admin den Sieger auswählt. Bei einer Runde gibt er die Reihenfolge an.
  - **Keine Wertung:** Das Ergebnis zählt **nicht** zu Punkten und Toren des Abends. Es legt nur die Reihenfolge fest.
  - **Speicherort:** neue Spalte `training_sessions.decider_results`, siehe 6.9.
- **Hintere Plätze:** Ein Gleichstand dort bleibt stehen. Die Tabelle zeigt dann für alle Beteiligten dieselbe Platzzahl (zum Beispiel zweimal „4.“), mit dem Hinweis „gleichauf“.

Laut Backup gab es bisher an keinem Abend einen solchen völligen Gleichstand. Die Regel betrifft also nur künftige Abende.

### 6.3 Keine stillschweigende Rückwirkung (Datenschutz für vergangene Titel)

Nachrechnung aller 24 abgeschlossenen Abende aus dem Backup vom 06.11.2026 (`node scripts/dtkv-ranking-reference.mjs <backup>/data`):
- **6 Abende** hätten nach DTKV eine andere Reihenfolge.
- **Bei 1 Abend** wäre der Sieger ein anderer: Jugend- und Damenmeisterschaft vom 08.05.2026, Timo Schwarz statt Jamil Hecker.
- **Bei 4 Abenden** wäre der Vize ein anderer.

Die Meister- und Vizetitel dieser Abende sind in den Jahrestabellen aber bereits gezählt. Historie, Statistik und Export rechnen die Rangfolge jedes Mal neu aus. Ohne Vorkehrung würden sie für alte Abende plötzlich andere Sieger zeigen als die Ligen.

Deshalb bekommt jeder Abend die Wertungsregel, nach der er gespielt wurde:
- **Neue Spalte** `training_sessions.ranking_rule text` (6.9).
- **Bestehende Abende:** Sie bekommen in der Migration `'legacy'`, das ist die bisherige Sortierung aus `calculatePlayerStats`. Sie wird unverändert als `rankLegacy` erhalten.
- **Neue Abende:** Sie bekommen `'dtkv2026'`, über den Default der Spalte, und die App setzt den Wert zusätzlich ausdrücklich.
- **Alle Stellen**, die eine Rangfolge eines Abends zeigen oder verwenden, wählen die Funktion nach `ranking_rule`. Der Nutzer hat am 12.11.2026 entschieden: **keine** rückwirkende Umstellung alter Abende.

### 6.4 Jahrestabellen: analog SO § 2 Abs. 6

SO § 2 Abs. 6 (Einzelwertung in einer Liga) nennt diese Reihenfolge:
1. gewonnene Punkte (absteigend)
2. **weniger verlorene Punkte** (aufsteigend)
3. Tordifferenz
4. geschossene Tore

Der heutige Code lässt Punkt 2 aus. Das ist wichtig, weil Spieler unterschiedlich viele Spiele haben.

- **Geprüft am 12.11.2026 (live, nur lesend):** Die Reihenfolge der aktuellen Jahrestabellen ändert sich dadurch **nicht**. Die Umstellung ist also gefahrlos.
- **Völlige Gleichheit:** Sie ist im Liga-Sinn unentschieden (SO § 2 Abs. 5 Satz 2 sieht dort ein Entscheidungsspiel vor). Die Tabelle zeigt dann dieselbe Platzzahl.

### 6.5 Ewige Tabelle (Vereinsregel, unverändert)

Die SO kennt keine ewige Tabelle. Es bleibt bei Punkte → Meistertitel (`EternalLeagueTable.tsx`). Bei Gleichheit wird dieselbe Platzzahl gezeigt. Ergänzt wird nur das, damit die Sortierung eindeutig ist und nicht von der Datenreihenfolge abhängt.

### 6.6 Schweizer System, Vorrunde (Vereinsregel, ergänzt)

Die SO erlaubt das Schweizer System (§ 8 Abs. 5 Sätze 18 bis 24). Sie sagt nur, dass sich die Play-Off-Paarungen „anhand der Platzierung im Schweizer System“ ergeben. **Wertungskriterien nennt sie nicht**, Buchholz oder Ähnliches kommt nicht vor. **Ergänzte Regel:** Die bisherigen Kriterien bleiben, damit sich nichts am gewohnten Ablauf ändert. Der Rest wird eindeutig gemacht:

1. Punkte pro Spiel. Damit benachteiligt ein Freilos niemanden.
2. Buchholz: Durchschnitt der Punkte pro Spiel aller bisherigen Gegner.
3. Tordifferenz
4. geschossene Tore
5. direkter Vergleich, falls die beiden gegeneinander gespielt haben
6. **Los**: Es wird einmal gezogen und im `swiss_state` gespeichert, damit sich die Reihenfolge beim Neuladen nicht ändert.

Die Kriterien 4 bis 6 sind neu. Diese Rangliste bestimmt die Auslosung (Schritt B, R4) und die Setzliste fürs Playoff (SO § 8 Abs. 5 Satz 24).

### 6.7 K.-o.-Spiele, Playoff, Finale und Entscheidungsspiele: kein Unentschieden

- **Regel:** Im K.-o.-Spiel gewinnt, wer die meisten Tore erzielt (SO § 9 Abs. 1). Bei Gleichstand wird mit Sudden Death weitergespielt, bis ein Tor fällt (§ 9 Abs. 2). Im Finale gibt es erst eine Verlängerung von 2 × 2 Minuten, dann eine Neuansetzung und dann Sudden Death (§ 9 Abs. 3). Ein K.-o.-Spiel hat also nie ein unentschiedenes Endergebnis.
- **Heute:** Die App nimmt im Playoff ein Unentschieden an. `playoffMatchWinner` liefert dann `null`, und das Playoff hängt.
- **Neu:** Die Eingabe eines gleichen Ergebnisses in einem Playoff- oder Entscheidungsspiel wird abgelehnt, mit dem Hinweis „Im K.-o.-Spiel gibt es kein Unentschieden. Bitte das Endergebnis inklusive Sudden-Death-Tor eintragen.“ Die Validierung gilt in `PlayoffBracket.tsx` und überall dort, wo Playoff-Ergebnisse gespeichert werden.
- **Sudden Death erfassen:** Bei jedem Playoff- und Entscheidungsspiel gibt es zusätzlich einen Schalter „durch Sudden Death entschieden“. Ist er an, muss der Sieger genau ein Tor mehr haben, denn Sudden Death endet mit dem nächsten Tor. Sonst erscheint der Hinweis „Bei Sudden Death gewinnt der Sieger mit genau einem Tor Vorsprung.“
  - **Im Finale:** Nach einer Verlängerung (2 × 2 min, § 9 Abs. 3) ist der Schalter aus. Nur ein echtes Sudden-Death-Tor zählt.
  - **Gespeichert:** in `PlayoffMatch.suddenDeath` (im `swiss_state`) und in der neuen Spalte `matches.sudden_death` (6.9).
  - **Gebraucht für:** die Abschlussrangliste (6.8).

### 6.8 Abschlussrangliste im Schweizer System: SO § 9 Abs. 6 (verbindlich, vom Nutzer präzisiert)

Wortlaut der Regel: „Alle ausgeschiedenen Spieler einer Play-Off-Runde werden nach den folgenden Kriterien für die Gesamtwertung eingeordnet:
1. Anzahl der erspielten Punkte
2. Tordifferenz aus allen Spielen
3. die bessere Endplatzierung des Gegners

[Punkte im Playoff:] Sieg ohne Sudden Death 2, Sieg nach Sudden Death 1,5, Niederlage nach Sudden Death 0,5, Niederlage ohne Sudden Death 0. Man beginnt bei den Ausgeschiedenen des Halbfinales, danach sind die ersten vier eindeutig platziert; dann die des Viertelfinales, danach die ersten 8, es folgen die des Achtelfinales usw.“

**Festlegung des Nutzers (12.11.2026):** Die Punkte der Abschlussrangliste sind die **Gesamtpunkte der Vorrunde plus die Punkte aus dem Playoff**, zusammengezählt. Die halben Punkte sind nur die Zählformel für Playoff-Spiele, die durch Sudden Death entschieden wurden. Mit ihnen lassen sich die Plätze bestimmen. Entsprechend gilt für die Tordifferenz „aus allen Spielen“: Vorrunde plus Playoff. **Im Verein gibt es pro Playoff-Paarung immer genau ein Spiel.** Die Best-of-Varianten aus § 9 Abs. 5 werden also nicht gebraucht.

**Algorithmus** (Referenz: `finalRankingSwiss` in `scripts/dtkv-ranking-reference.mjs`, importierbar):
1. **Plätze 1 und 2:** Platz 1 ist der Sieger des Finales, Platz 2 der Verlierer.
2. **Ausgeschiedene je Runde:** Danach Runde für Runde rückwärts (Halbfinale, Viertelfinale, Achtelfinale) die Verlierer dieser Runde. Ein Halbfinal-Verlierer steht also immer vor einem Viertelfinal-Verlierer. Sortiert wird innerhalb der Runde nach
   1. **Punkten:** Gesamtpunkte der Vorrunde (2 / 1 / 0 je Spiel, ein Vorrunden-Freilos gibt 0) **plus** Playoff-Punkte (2 / 1,5 / 0,5 / 0 je Spiel; ein Playoff-Freilos zählt als kein Spiel und gibt 0)
   2. **Tordifferenz:** aus allen Spielen, also Vorrunde plus Playoff
   3. **Endplatzierung des Gegners,** gegen den sie ausgeschieden sind. Wer gegen den besser Platzierten verloren hat, steht vorn. Der Gegner ist immer schon platziert, weil rückwärts gearbeitet wird. Dieses Kriterium entscheidet immer, denn jeder Spieler einer Runde scheidet gegen einen anderen Gegner aus.
3. **Nicht qualifizierte Spieler:** Wer sich nicht fürs Playoff qualifiziert hat, folgt in der Reihenfolge der Swiss-Rangliste (6.6). Das ist analog zu SO § 8 Abs. 8 und als Vereinsregel ergänzt.
4. **Ohne Playoff** (`endMode = 'direct'`): Die Abschlussrangliste ist die Swiss-Rangliste (6.6).

**Grenzen der Regel:**
- **Liga-Übertragung bleibt ganzzahlig:** Die halben Punkte gelten nur für die Abschlussrangliste. In die Jahrestabellen und die Ewige Tabelle gehen Playoff-Spiele weiter mit 2 / 0 Punkten ein, wie heute in `computeFinalSwissStats`. Meister und Vize kommen weiter aus dem Finale.
- **Heutiger Fehler:** `computeFinalSwissStats` setzt bisher nur Sieger und Finalverlierer nach vorn und sortiert alle anderen nach Gesamtpunkten, ohne die Ausscheiderunde zu beachten. Ein Achtelfinal-Verlierer kann so vor einem Halbfinalisten stehen. Diese Sortierung wird durch den Algorithmus oben ersetzt.

**Anzeige:**
- **Turnier:** Nach dem Finale erscheint in `SchweizSystem.tsx` die Tabelle „Abschlussrangliste“ mit den Spalten:
  - Platz
  - Spieler
  - „ausgeschieden in“ (Finale, Halbfinale, Viertelfinale, Achtelfinale, Vorrunde)
  - Punkte gesamt, mit Komma bei halben Punkten (zum Beispiel „12,5“), dahinter in Klammern „davon Playoff“
  - Tordifferenz gesamt

  Darunter steht ein Hinweis: „Platzierung nach DTKV-Spielordnung § 9 Abs. 6: Punkte aus Vorrunde und Playoff, Sudden-Death-Sieg 1,5 / -Niederlage 0,5 Punkte“.
- **Historie:** Die Details eines Swiss-Abends mit Playoff zeigen dieselbe Abschlussrangliste. Sie wird aus den gespeicherten Spielen berechnet (`phase`, `playoff_round`, `sudden_death`). Vorrundenpunkte und -tore kommen aus den Spielen mit `phase = 'swiss'`.
- **Exporte:** PDF und Excel eines Swiss-Abends mit Playoff bekommen die Abschlussrangliste als eigene Tabelle bzw. als eigenes Blatt „Abschlussrangliste“.

**Pflicht-Testfall** (Fall 7 im Referenzskript): Playoff ab dem Viertelfinale mit 8 von 12 Spielern.
- **Vorrunde** (Punkte / Tordifferenz):
  - P1 10/+12, P2 9/+8, P3 9/+5, P4 8/+6
  - P5 8/+3, P6 7/+2, P7 7/+1, P8 7/−2
  - P9 5/0, P10 4/−3, P11 3/−6, P12 2/−9
- **Playoff:**
  - VF P1-P8 2:1, P4-P5 2:3 (Sudden Death), P2-P7 4:0, P3-P6 1:2
  - HF P1-P5 1:2, P2-P6 2:1 (Sudden Death)
  - Finale P5-P2 0:3
- **Erwartet:** P2 > P5 > P1 > P6 > P3 > P4 > P7 > P8 > P9 > P10 > P11 > P12.
- **Begründung:**
  - Halbfinale: P1 hat 10 + 2 = 12 Punkte, P6 hat 7 + 2 + 0,5 = 9,5.
  - Viertelfinale: P3 hat 9, P4 hat 8 + 0,5 = 8,5. P7 und P8 haben beide 7 Punkte und −3 Tore. P7 hat gegen den Ersten verloren, P8 gegen den Dritten, also steht P7 vorn.
  - Gegenprobe: Mit der falschen Auslegung „nur Playoff-Punkte“ ergibt sich eine andere Reihenfolge (P6 vor P1). Der Test erkennt diesen Fehler also.

Zusätzlich sind Tests nötig für Playoffs ab dem Achtelfinale und ab dem Halbfinale, für Playoffs mit Freilos und für das progressive Format, bei dem die besten vier direkt im Viertelfinale stehen. Für zufällige Turniere muss die TypeScript-Umsetzung dieselbe Reihenfolge liefern wie `finalRankingSwiss` aus dem Referenzskript.

### 6.9 Migration für Schritt W

```sql
-- supabase/migrations/<timestamp>_ranking_rule.sql
-- Each evening keeps the ranking rule it was played under, so past winners never change silently.
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS ranking_rule text;
UPDATE public.training_sessions SET ranking_rule = 'legacy' WHERE ranking_rule IS NULL;   -- only the new column
ALTER TABLE public.training_sessions ALTER COLUMN ranking_rule SET DEFAULT 'dtkv2026';
ALTER TABLE public.training_sessions ALTER COLUMN ranking_rule SET NOT NULL;
ALTER TABLE public.training_sessions ADD CONSTRAINT training_sessions_ranking_rule_check CHECK (ranking_rule IN ('legacy', 'dtkv2026'));
-- Result of a decider (Entscheidungsspiel/-runde) for a complete tie at place 1 or 2: [{ "players": [id, ...], "order": [id, ...] }]
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS decider_results jsonb;
-- Playoff game decided by sudden death (Spielordnung § 9 Abs. 2); needed for the final ranking (§ 9 Abs. 6)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sudden_death boolean NOT NULL DEFAULT false;
```

Das `UPDATE` füllt nur die neue Spalte und ist deshalb erlaubt (Regel 4). **Bereits geprobt** am 12.11.2026 an der Probe-DB mit dem Backup vom 06.11.2026: Der Fingerabdruck war identisch, alle 27 Abende standen auf `legacy`, ein neuer Abend bekam `dtkv2026`, und `sudden_death` war überall `false`. Der Fingerabdruck muss vorher und nachher identisch sein, weil er die neuen Spalten nicht liest. Prüfe zusätzlich: `SELECT ranking_rule, count(*) FROM training_sessions GROUP BY 1` liefert nur `legacy`.

- **Probe zuerst:** Erst die Probe-DB (4.1), dann 🛑 Zustimmung, dann live.
- **App ohne Migration:** Fehlt die Spalte (Vorschau vor der Migration), behandelt die App alle Abende als `legacy`, neue eingeschlossen. So ändert sich nichts, solange die Migration nicht live ist.
- **Laufender Abend:** Wird zum Zeitpunkt der Migration gerade ein Abend gespielt, bekommt er `legacy`. Deshalb gilt Regel 9: keine Migration während eines Trainings.
- **Zeitfenster zwischen Migration und Auslieferung:** Nach der Migration bekommen neue Abende per Default `dtkv2026`. Die noch laufende alte App-Version würde sie aber nach der alten Regel anzeigen und übertragen. Merge den PR deshalb direkt nach der Migration und prüfe, dass das Vercel-Deployment fertig ist. In diesem Zeitfenster darf kein Abend gestartet werden. Sprich das mit dem Nutzer ab.

### 6.10 Umsetzung im Code

- **Neue Datei `src/lib/ranking.ts`** (rein funktional, ohne React und ohne Supabase). Inhalt:
  - `rankGroupDtkv(players, matches, deciders?)`: liefert Blöcke, wie die Referenz.
  - `rankLegacy(stats, matches)`: die heutige Sortierung, unverändert aus `calculatePlayerStats` übernommen.
  - `rankSession(session)`: wählt nach `session.rankingRule` und `session.tournamentType`. Liefert `{ player, stats, place, tiedWith }[]`.
  - `compareLeagueRows`: nach 6.4.
  - `compareEternalRows`: nach 6.5.
  - `rankSwiss`: nach 6.6.
  - `finalRankingSwiss(playoffMatches, swissRanking)`: nach 6.8.
- **`calculatePlayerStats`** berechnet weiter nur die Zahlen. Das Sortieren übernimmt `ranking.ts`.
- **`TrainingSession`** bekommt `rankingRule?: 'legacy' | 'dtkv2026'` und `deciderResults?`. `storage.ts` liest und schreibt beides. Fehlt die Spalte beim Lesen, gilt `'legacy'`.
- **Sudden Death:** `Match` und `PlayoffMatch` bekommen `suddenDeath?: boolean`. `syncMatches` in `storage.ts` schreibt `sudden_death` nur, wenn die Spalte existiert. Vor der Migration wird das Feld weggelassen, damit die Vorschau nicht scheitert. `toMatch` liest das Feld mit `false` als Ersatz. `convertSwissToTrainingSession` übernimmt das Feld.
- **Alle Stellen umstellen**, die heute selbst sortieren oder `calculatePlayerStats(...)[0]` als Sieger nehmen. Zum Stand `main` am 12.11.2026 sind das:
  - `src/pages/Training.tsx` (Tabelle, Sieger und Vize beim Übertragen, Sortierung der Liga nach dem Übertragen)
  - `src/pages/History.tsx` (Liste und Details; Abende mit `tournamentType = 'swiss'` mit der Swiss-Rangliste)
  - `src/lib/exportPdf.ts` und `src/lib/exportXlsx.ts` (Tabelle und Sieger)
  - `src/lib/statistics.ts` (`eveningWinner`)
  - `src/pages/Leagues.tsx` (Sortierung nach dem Bearbeiten)
  - `src/components/EternalLeagueTable.tsx`
  - `src/pages/SchweizSystem.tsx` und `src/pages/swissHelpers.ts` (Rangliste, Sieger und Vize, Ligasortierung)
  - `src/lib/swissPairing.ts` (`computeSwissStats`-Sortierung)
  Suche zur Kontrolle mit `grep -rn "calculatePlayerStats\|\.sort((a, b)" src`.
- **Anzeige von Gleichstand:** Die Tabellenkomponenten (`StandingsTable`, Liga-Tabellen, PDF und Excel) zeigen bei Gleichstand dieselbe Platzzahl.
- **Erläuterung:** Ein kurzer Hinweis unter der Abendtabelle („Bei Punktgleichheit: direkter Vergleich, dann Tordifferenz und Tore nach DTKV-Spielordnung § 8 Abs. 3“). Er erscheint nur für `dtkv2026`.

### 6.11 Abnahme Schritt W

- Die 6 Pflichtfälle und die Eigenschaftstests sind grün. Die Mutationen schlagen an: Direkter Vergleich entfernt, Untergruppe nicht neu gerechnet, Tore aus der falschen Gruppe.
- **Altdaten-Test:** Alle `legacy`-Abende aus dem Backup zeigen in Historie, PDF, Excel und Statistik denselben Sieger und dieselbe Reihenfolge wie vorher. Vergleiche über einen Test mit den Backup-Daten oder einen Browsertest.
- **Neuer Abend:** Er speichert `ranking_rule = 'dtkv2026'` und wird nach DTKV sortiert. Prüfe das per Browsertest mit zustandsbehaftetem Mock und dem Fall 1 aus 6.1.
- **Entscheidungsspiel-Dialog:** Er erscheint bei völligem Gleichstand um Platz 1 und schreibt `decider_results`.
- **Playoff:** Ein unentschiedenes Ergebnis wird abgelehnt. Bei Sudden Death wird nur ein Ein-Tor-Sieg angenommen, und `sudden_death` wird gespeichert.
- **Abschlussrangliste:** Fall 7 und die zusätzlichen Formate aus 6.8 sind grün. Ein Browsertest spielt ein Swiss-Turnier mit Playoff durch und prüft die angezeigte Abschlussrangliste samt halber Punkte.
- **Fingerabdruck:** Er ist live vorher und nachher identisch.

---

## 7. Schritt B: Schweizer System neu

**Branch:** `feat/swiss-rewrite`. Enthält eine additive Migration (7.6).

> **Umsetzungsstand (Schritt B im Pull Request):** Auslosung in `src/lib/swissPairingEngine.ts` (`pairRound`, `maxSwissRounds`, `BYE_ID`, Fehlerklassen) und `src/lib/swissPairing.ts` (`generateSwissRoundMatches`, `generateRefereeRound`). Übertragung in `src/lib/leagueTransfer.ts`. Speichern in `src/lib/storage.ts` (`swissStateSupported`, `saveSwissSession`, `loadRunningSwissSession`, `discardSwissSession`) und `src/hooks/useSwissAutosave.ts`. Migration: `supabase/migrations/20261113100000_swiss_state.sql`. Tests: `swissPairingEngine.test.ts`, `leagueTransfer.test.ts`, `storageSwiss.test.ts`, `e2e/swiss-flow.mjs`.
>
> **Abweichungen vom Plan, bewusst:**
> - **Abschluss:** Es bleibt bei der Reihenfolge des Trainings (erst Ligen, jede mit Vermerk in `transferredToLeagues`, dann der Abschluss). Jeder Schritt wird sofort in der Datenbank gespeichert, eine wiederholte Übertragung zählt nichts doppelt, und es geht nichts verloren. Der Abend wird nicht vor den Ligen als abgeschlossen gespeichert, weil er sonst bei einem Abbruch in der Historie stünde, ohne in den Ligen zu sein.
> - **Zurücksetzen:** Es wird nichts gelöscht. Nur `swiss_state` wird geleert, Abend, Spieler und Spiele bleiben stehen.
> - **„In Historie speichern“:** Der Knopf ist in diesem Modus ausgeblendet, weil er ein laufendes Turnier als abgeschlossen markieren würde. Ohne die Datenbankspalte bleibt er wie bisher.
> - **Platzhalter im Playoff:** Leere Plätze und Freilose haben Platzhalter-IDs, die keine UUIDs sind. Beim Speichern werden sie in eine gültige, aus der Spiel-ID abgeleitete UUID mit dem Namen „–“ umgeschrieben (`storedPlayerId`).

### 7.1 Was heute kaputt ist (belegt, siehe Anhang)

1. **Wiederholungsspiele:** `generateSwissRoundMatches` paart gierig von oben nach unten und weicht auf ein Wiederholungsspiel aus, wenn es nicht weiterkommt. In Simulationen kam es dadurch in 47 bis 80 % der Turniere zu einem **vermeidbaren** Wiederholungsspiel.
2. **Schiedsrichter-Modus fehlerhaft** (`generateRefereeRound`):
   - Bei 6, 7, 10, 11 oder 14 Spielern scheitert schon die erste Runde immer.
   - Bei anderen Spielerzahlen scheitert sie oft in späteren Runden.
   - Ein Spieler kann zweimal in derselben Runde spielen, weil der Ausweichpfad Spieler des anderen Durchgangs nimmt.
   - Die angezeigte Schiedsrichterliste eines Durchgangs enthält die Spieler **desselben** Durchgangs.
   - Fehler werden geworfen, aber nirgends abgefangen. Der Button tut dann einfach nichts.
3. **Zweites Freilos:** Haben alle schon ein Freilos gehabt, bekommt der Letzte ein zweites (`reversed[0]`).
4. **Rundenzahl:** Der Regler erlaubt 2 bis 10 Runden, unabhängig von der Spielerzahl. Bei 4 Spielern sind ohne Wiederholung aber höchstens 3 Runden möglich.
5. **Nur im Browser gespeichert:** Der Turnierzustand liegt nur im `localStorage` (`swiss-session-v1`). Bei leerem Akku, Gerätewechsel oder gelöschten Browserdaten ist das laufende Turnier weg.
6. **Übertragung ins Ligen-Format:** `handleTransferResults` in `SchweizSystem.tsx` ignoriert `league.isEternal`. In die Ewige Tabelle bucht sie Siege, Tore und Vizetitel. Beim Training werden dort nur Punkte und Meistertitel gebucht. Außerdem speichert sie zuerst die Ligen und erst danach den Abend. Bricht es dazwischen ab, steht die Übertragung nur im Browser.

### 7.2 Fachregeln (verbindlich)

- **R1 Keine Wiederholung:** In der Vorrunde eines Turniers, also in allen Runden und im Schiedsrichter-Modus in beiden Durchgängen, spielt jedes Spielerpaar höchstens einmal gegeneinander. Das Playoff ist ausgenommen.
- **R2 Höchstens ein Freilos:** Bei ungerader Spielerzahl bekommt pro Runde genau ein Spieler ein Freilos, und jeder Spieler höchstens eins pro Turnier.
- **R3 Vollständige Runde:** Jeder Spieler, der kein Freilos hat, spielt pro Runde genau ein Spiel. Niemand fehlt, niemand spielt doppelt. Im Schiedsrichter-Modus spielt er dieses eine Spiel in genau einem der beiden Durchgänge.
- **R4 Ähnliche Stärke:** Runde 1 wird zufällig gelost. Ab Runde 2 wird nach dem aktuellen Tabellenstand gepaart, also nach der Swiss-Rangliste aus Schritt W (6.6). Bevorzugt wird ein Gegner mit möglichst ähnlichem Rang, ohne R1 zu verletzen.
- **R5 Freilos nach unten:** Das Freilos geht bevorzugt an den Rangniedrigsten, der noch keins hatte.
- **R6 Vorausschau:** Eine Runde wird nur so gelost, dass alle noch geplanten Runden danach ohne Wiederholung lösbar bleiben. Das Turnier kann also nie in einer Sackgasse landen.
- **R7 Rundenzahl:** Höchstens `n − 1` Runden bei gerader und `n` Runden bei ungerader Spielerzahl, mit jeweils einem Freilos pro Spieler. Die obere Grenze bleibt zusätzlich bei 10. Der Regler passt sich der Spielerzahl an. Ist die gewählte Rundenzahl beim Start zu hoch, wird sie mit Hinweis begrenzt.
- **R8 Schiedsrichter-Modus:**
  - Zuerst wird die ganze Runde nach R1 bis R6 ausgelost.
  - Dann werden die Spiele nach Rang im Reißverschluss auf die Durchgänge verteilt: Spiel 1 (die besten beiden) in Durchgang 1, Spiel 2 in Durchgang 2, Spiel 3 in Durchgang 1 und so weiter.
  - **Schiedsrichter eines Durchgangs** sind die Spieler, die im **anderen** Durchgang spielen.
  - **Der Spieler mit Freilos** ist in **einem** Durchgang wirklich frei (dort steht „Spielfrei“, er ist dort kein Schiedsrichter) und im **anderen** Durchgang Schiedsrichter (Entscheidung des Nutzers vom 13.11.2026; sie ersetzt die frühere Fassung „in beiden Durchgängen“). Der freie Durchgang ist der mit weniger Spielen, weil dort weniger Schiedsrichter gebraucht werden und der Freilos-Spieler so dort hilft, wo die Schiedsrichter knapper sind (bei 7 Spielern: 3 und 4 statt 2 und 5). Bei gleich vielen Spielen wird der freie Durchgang gelost. `byePlayerId` steht an dem Durchgang, in dem er frei ist.
  - Die Durchgänge können sich um ein Spiel unterscheiden. Das ist gewollt, denn genau das behebt den Absturz bei 6, 7, 10, 11 und 14 Spielern.
- **R9 Klarer Fehlerfall:** Lässt sich eine Runde trotzdem nicht auslosen (darf nach R6 nicht vorkommen), wird **kein** Wiederholungsspiel erzeugt. Stattdessen erscheint eine verständliche Fehlermeldung als Toast, und der Zustand bleibt unverändert.

### 7.3 Algorithmus (siehe `scripts/swiss-pairing-prototype.mjs`)

Neue Datei `src/lib/swissPairingEngine.ts`, rein funktional, ohne React und ohne Supabase:

```ts
export const BYE_ID = '__BYE__';
export type Rng = () => number;               // injizierbar, damit Tests reproduzierbar sind

export interface PairingInput {
  ranking: string[];        // Spieler-IDs in Ranglistenreihenfolge (bester zuerst); Runde 1: zufällig gemischt
  played: Set<string>;      // bereits gespielte Paare der Vorrunde als pairKey(a,b); Freilose als pairKey(id, BYE_ID)
  roundsAfter: number;      // wie viele Runden NACH dieser noch geplant sind (für R6)
  budget?: number;          // Schutz gegen Endlosrechnen, Standard 3_000_000 Suchschritte
}
export function pairKey(a: string, b: string): string;  // sortiert, z. B. a<b ? `${a}|${b}` : `${b}|${a}`
export function pairRound(input: PairingInput): [string, string][] | null;  // null = nicht auslosbar (R9)
export function maxSwissRounds(playerCount: number): number;                // R7
```

**Freilos als virtueller Spieler:** Bei ungerader Spielerzahl wird `BYE_ID` **an das Ende** der Rangliste gehängt. Ein Spieler, der gegen `BYE_ID` gepaart wird, hat das Freilos. Weil Freilose in `played` stehen, erzwingt R1 automatisch R2, und durch die Position am Ende auch R5.

**Suche in `pairRound`:**
1. Nimm den bestplatzierten noch ungepaarten Spieler `a`.
2. Mögliche Gegner sind alle ungepaarten `b` mit `!played.has(pairKey(a,b))`. Sortiere sie nach `|rang(b) − rang(a)|`, also den nächstplatzierten zuerst (R4).
3. Paare `a` mit `b` und mach rekursiv weiter. Klappt es nicht, nimm den nächsten Kandidaten (Backtracking).
4. Ist eine vollständige Runde gefunden, nimm sie nur, wenn `canSchedule(played ∪ Runde, roundsAfter)` stimmt (R6). Sonst such weiter.
5. Findet sich nichts, gib `null` zurück.

**`canSchedule(played, k)`:** Prüft, ob sich `k` weitere vollständige Runden ohne Wiederholung bilden lassen. Rekursiv: Bei `k = 0` stimmt es. Sonst wird irgendeine vollständige Runde gesucht (Backtracking über den ersten ungepaarten Spieler) und für sie `canSchedule(…, k−1)` geprüft. Zwischenergebnisse werden in einer Map gemerkt, Schlüssel ist `k + sortierte played-Liste`.

**Budget:** Jeder Suchschritt zählt herunter. Ist das Budget aufgebraucht, wirf einen eigenen Fehler `PairingBudgetError`. Die UI zeigt dann R9 an. In den Simulationen kam das nie vor. Ein Test sichert ab, dass es bei realistischen Größen (bis 24 Spieler) nicht vorkommt.

**Seiten (Heim/Weiß):** Die bestehende Logik `assignSides` bleibt (weniger Weißspiele bekommt Weiß). Sie bekommt aber den injizierbaren `rng` statt `Math.random`.

**Runde 1:** `ranking` ist die mit `rng` gemischte Spielerliste.

**Integration in `swissPairing.ts`:**
- `generateSwissRoundMatches(players, rounds, targetRound, totalRounds, rng = Math.random)`:
  1. Rangliste mit `computeSwissStats` bilden. Wie heute: innerhalb gleicher Punktzahl mischen, aber mit `rng`.
  2. `played` aus **allen** Vorrunden-Spielen aller bisherigen Runden bilden, also auch aus Durchgang 1 und 2 im Schiedsrichter-Modus. Ebenso die Freilose aus `round.byePlayerId`.
  3. `pairRound` aufrufen. Bei `null` einen Fehler `SwissPairingError` werfen.
  4. Die Paare in `Match`-Objekte umwandeln. Ein Paar mit `BYE_ID` wird zu `byePlayerId`.
- `generateRefereeRound(...)`: Ruft dieselbe Auslosung auf und verteilt die Spiele dann nach R8 auf `pass1` und `pass2`. `pass1.referees` sind die Spieler aus `pass2` und umgekehrt. `byePlayerId` steht wie heute an `pass1`.
- Den Pfad „zweites Freilos“ und den Ausweichpfad mit Wiederholung **entfernen**.
- **Rückgängig machen:** „Letzte Runde entfernen“ (`handleUndoRound`) setzt heute `hasHadBye` zurück. Leite das Freilos stattdessen künftig nur aus `rounds[].byePlayerId` ab, nicht mehr aus `players[].hasHadBye`. Dann kann es nicht auseinanderlaufen. `hasHadBye` an `Player` bleibt für alte Daten lesbar, wird aber nicht mehr geschrieben.

**Aufrufer in `SchweizSystem.tsx`:** `advanceToNextRound` muss `SwissPairingError` und `PairingBudgetError` abfangen. Dann erscheint ein Toast, etwa „Für Runde X ist keine Auslosung ohne Wiederholung möglich. Bitte Rundenzahl prüfen.“, und der Zustand bleibt unverändert. Kein ungefangener Fehler mehr.

### 7.4 Rundenzahl in der UI (R7)

- **Regler:** `max = Math.min(10, maxSwissRounds(players.length))`, `min = 1`. Die Empfehlung `⌈log₂ n⌉` bleibt, wird aber auf das Maximum begrenzt.
- **Start:** Ist `config.rounds > maxSwissRounds(n)`, wird die Zahl mit Hinweis auf das Maximum gesetzt.
- **Schiedsrichter-Modus:** Er braucht weiterhin mindestens 4 Spieler. Das ist bereits vorhanden.

### 7.5 Speichern in der Datenbank statt nur im Browser

**Ziel:** Ein laufendes Turnier überlebt einen Neustart des Browsers und einen Gerätewechsel. Zuschauer können es mitlesen. Das Verhalten soll dem Training entsprechen.

- **Neue Spalte** `training_sessions.swiss_state jsonb NULL` (Migration 7.6). Sie enthält das komplette `SwissSession`-Objekt (Konfiguration, Runden mit Durchgängen, Schiedsrichtern, Freilosen, Playoff).
- **Speichern:** Jede Änderung speichert mit der vorhandenen Warteschlange `createSaveQueue` (wie `useSessionAutosave`):
  1. `training_sessions` per Upsert: `id = session.id`, `tournament_type = 'swiss'`, `is_completed`, `name`, `date`, `round_count`, `matches_per_pairing = 1`, `transferred_to_leagues`, `swiss_state`.
  2. Spieler und Spiele mit den vorhandenen Funktionen aus `storage.ts` (`syncPlayers`, `syncMatches` über `convertSwissToTrainingSession`). Dann funktionieren Historie, Statistik und Exporte unverändert.
  - Erweitere `saveSessionToDB` dafür um einen optionalen Parameter `swissState`. Ohne ihn darf die Spalte **nicht** überschrieben werden: Lass sie dann im Upsert-Objekt weg und setz sie nicht auf `null`.
  - **Neu:** `saveSwissSession(s)` und `loadRunningSwissSession()`. Letztere liefert den neuesten Abend mit `tournament_type = 'swiss' AND NOT is_completed AND swiss_state IS NOT NULL`.
- **Statusanzeige:** Den Speicherstatus mit `SaveStatusBadge` anzeigen, wie beim Training. Zusätzlich die Browser-Sicherung unter einem eigenen Schlüssel (`matchmaker:unsaved-swiss-session`), bis der Server bestätigt hat.
- **Übernahme vom Gerät** (wichtig gegen Datenverlust): Gibt es beim Laden der Seite als Admin `localStorage['swiss-session-v1']` und in der DB keinen Abend mit dieser `id`, speichere das Turnier einmal in die DB. Erscheint der Toast „Turnier vom Gerät übernommen“, entferne den alten Schlüssel **erst nach** bestätigtem Speichern. Gibt es beide und weichen sie voneinander ab, gewinnt die DB-Version. Die Gerätefassung bleibt dann unter `swiss-session-v1-conflict-<datum>` liegen. Nichts wird stillschweigend gelöscht.
- **Nur Admins speichern.** Zuschauer laden lesend und sehen keine Bearbeitungsknöpfe.
- **Abschluss:** Erst den Abend als abgeschlossen speichern, dann in die Ligen übertragen. Fehlt danach eine Liga, ist das wiederholbar über `transferred_to_leagues`. In Schritt E wird das durch die Transaktion ersetzt.
- **Ewige Tabelle** (Fehler 7.1.6): Die Swiss-Übertragung muss die Regel der Trainingsübertragung übernehmen. Bei `isEternal` werden nur `points`, `pointsAgainst` und `championships` gebucht, neue Spieler mit W/U/N und Toren = 0. Am besten ziehst du beide Übertragungen in eine gemeinsame, getestete Funktion `applySessionToLeague(league, stats, champion, vice)` in `src/lib/leagueTransfer.ts` zusammen. Die Trainingsseite nutzt sie ebenfalls. Bestehende Ligadaten werden **nicht** korrigiert, siehe Entscheidung 11.4.

### 7.6 Migration für Schritt B

```sql
-- supabase/migrations/<timestamp>_swiss_state.sql
-- Stores the running Swiss tournament (config, rounds, passes, referees, byes, playoff) so it survives a browser restart.
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS swiss_state jsonb;
```

Sie ist additiv. Die bestehenden Policies gelten auch für die neue Spalte. Zuerst die Probe (4.1) mit Fingerabdruck vorher und nachher, die Ausgaben müssen identisch sein. Dann 🛑 Zustimmung einholen, dann `apply_migration`, dann den Fingerabdruck live. Die App muss ohne die Spalte weiterlaufen: Fehlt sie, fällt sie auf den `localStorage` zurück und zeigt den Hinweis „Turnier wird nur auf diesem Gerät gespeichert“. Damit funktioniert auch die Vercel-Vorschau vor der Migration.

### 7.7 Tests (Pflicht)

1. **Engine-Unit-Tests** (`src/lib/__tests__/swissPairingEngine.test.ts`) mit einem gesäten Zufallsgenerator (zum Beispiel mulberry32):
   - Für n = 4 bis 16 und jede Rundenzahl 1 bis `maxSwissRounds(n)`, je mindestens 200 simulierte Turniere mit Zufallsergebnissen, müssen alle Regeln halten:
     - **0** Wiederholungen (R1)
     - jeder höchstens ein Freilos (R2)
     - jede Runde vollständig, niemand doppelt (R3)
     - nie `null` (R6)
   - Zusätzlich n = 20 und 24 mit 5 Runden und mit maximaler Rundenzahl, dafür weniger Turniere.
   - **R4:** In Runde 2 bei gerader Spielerzahl und ohne Zwang ist der Gegner des Ersten der Zweite.
   - **R5:** Das Freilos geht an den Letzten, wenn der noch keins hatte.
   - **R9:** Ein künstlich unlösbarer Fall (zum Beispiel 4 Spieler, alle Paare schon gespielt) liefert `null` und keine Wiederholung.
   - **Mutation:** Entfernst du absichtlich die Vorausschau, muss der Test anschlagen. Erlaubst du absichtlich eine Wiederholung, ebenfalls.
2. **Schiedsrichter-Modus:** Für n = 4 bis 14 je mindestens 200 Turniere über die maximale Rundenzahl:
   - Kein Spieler spielt in beiden Durchgängen.
   - Jeder Aktive spielt genau einmal pro Runde.
   - Die Schiedsrichter jedes Durchgangs sind genau die Spieler des anderen Durchgangs, bei ungerader Spielerzahl zusätzlich der Spieler mit Freilos, aber nur in dem Durchgang, in dem er nicht frei ist.
   - 0 Wiederholungen, kein Absturz.
3. **Playoff:** Eine Wiederholung aus der Vorrunde ist im Playoff erlaubt. Ein Test zeigt, dass zwei Vorrunden-Gegner im Halbfinale aufeinandertreffen können und die Auslosung trotzdem läuft. Ein unentschiedenes Playoff-Ergebnis wird abgelehnt (6.7).
   - **Schiedsrichter mit Freilos:** Bei ungerader Spielerzahl im Schiedsrichter-Modus ist der Spieler mit Freilos in genau **einem** Durchgang Schiedsrichter und im anderen frei (dort trägt der Durchgang das Freilos). Er steht in keinem Spiel.
4. **Übertragung** (`leagueTransfer.test.ts`):
   - Normale Liga: Alle Spalten werden addiert, plus Meister- und Vizetitel.
   - Ewige Tabelle: nur Punkte, Gegenpunkte und Meistertitel, sowohl für Training als auch für Swiss.
5. **Browsertest** (`e2e/swiss-flow.mjs` mit zustandsbehaftetem Mock): ein Turnier mit 7 Spielern, 3 Runden und Schiedsrichter-Modus durchspielen. Zwischendurch die Seite neu laden: Der Stand muss aus der „DB“ (dem Mock) zurückkommen. Prüfen, dass keine Wiederholung angezeigt wird und dass der Abschluss den Abend mit `is_completed = true` und `tournament_type = 'swiss'` schreibt. Außerdem den Übernahmefall testen: Steht vorher ein Turnier in `swiss-session-v1`, wird es in die DB geschrieben.

**Abnahme Schritt B:**
- Alle Tests sind grün, die Mutationen schlagen an.
- Der Browsertest ist grün.
- Der Fingerabdruck ist live vorher und nachher identisch.
- Der Nutzer hat die Vorschau mit einem Testturnier geprüft: einmal normal, einmal mit Schiedsrichter-Modus, einmal mit ungerader Spielerzahl. Bitte ihn ausdrücklich darum.
- **Testturniere aufräumen:** Testturniere aus der Vorschau landen in der echten Datenbank, weil die Vorschau die Live-DB benutzt. Sag das dem Nutzer vorher. Biete an, sie danach gezielt nach `id` zu löschen. Das ist ein 🛑 Stopp-Punkt mit Nachweis, dass nur diese IDs betroffen sind.

---

## 8. Schritt C: Doppelte Spielerzeilen bereinigen

**Branch:** `fix/duplicate-training-players`.

**Befund:** In `training_players` steht derselbe Spieler (gleiche `player_id`, gleicher Name) mehrfach im selben Abend. Laut Backup vom 06.11.2026 sind es 15 Gruppen: „1134. Meisterschaft vom 20.03.2026“ hat 11 Spieler je dreifach, „Jugend- und Damenmeisterschaft vom 22.05.2026“ 4 Spieler je doppelt. Die Spiele sind korrekt. Nur Spielerlisten und Spielerzahlen sind aufgebläht.

**Vorgehen:**
1. **Prüfen (nur lesend):** Innerhalb jeder Gruppe `(session_id, player_id)` ist `player_name` identisch. Abfrage:
   ```sql
   SELECT session_id, player_id, count(*), count(DISTINCT player_name) FROM training_players GROUP BY 1,2 HAVING count(*) > 1;
   ```
   `count(DISTINCT player_name)` muss überall 1 sein. Sonst Stopp und den Nutzer fragen.
2. **Migration** (🛑, weil sie Zeilen löscht):
   ```sql
   -- Removes exact duplicate players within an evening and prevents new ones.
   DELETE FROM public.training_players t
   USING public.training_players d
   WHERE t.session_id = d.session_id AND t.player_id = d.player_id AND t.player_name = d.player_name AND t.id > d.id;
   ALTER TABLE public.training_players ADD CONSTRAINT training_players_session_player_unique UNIQUE (session_id, player_id);
   ```
3. **Code prüfen:** `syncPlayers` in `storage.ts` fügt nur Spieler ein, deren `player_id` im Abend fehlt. Die Constraint bricht also nichts. Teste das mit dem zustandsbehafteten Mock und an der Probe-DB, indem du einen Abend zweimal speicherst.
4. **Fingerabdruck:**
   - **Erwartet:** `rows | training_players` sinkt genau um die Zahl der Duplikate, und `spieler=` sinkt bei genau diesen zwei Abenden.
   - **Probe am Backup vom 06.11.2026** (bereits durchgeführt, mit genau dieser Migration): `training_players` von 204 auf 178 Zeilen, „1134. Meisterschaft vom 20.03.2026“ von 33 auf 11 Spieler, „Jugend- und Damenmeisterschaft vom 22.05.2026“ von 8 auf 4 Spieler. Alle Ligazeilen und alle Ergebnis-Prüfsummen waren identisch. Live können die Zahlen leicht abweichen, wenn seither Abende dazugekommen sind. Die Struktur des Diffs muss aber gleich sein.
   - **Unverändert bleiben müssen:** alles andere, insbesondere alle `ergebnisse=`-Prüfsummen und alle Ligazeilen.
   Leg dem Nutzer den Diff vor.

---

## 9. Schritt D: Feste Spieler-Identität (später)

> **Stand nach Rücksprache am 12.11.2026:** Der Nutzer klammert die Namensfrage für die **Jahrestabellen** aus. Dort sieht er in der Oberfläche keine doppelten Namen. Die **Ewige Tabelle** prüft er mit dir in einem eigenen nächsten Schritt: mögliche Duplikate „Klaudio Lange“ und „Benjamin Buza“. Schritt D und E werden erst nach dieser Prüfung und nach ausdrücklicher Freigabe begonnen. Bis dahin ist der folgende Text nur die Vorlage.

**Branch:** `feat/player-identity-schema` (D1), danach je ein eigener PR für D2 (Daten füllen) und D3 (App). Stand 13.11.2026: D1 begonnen, Vorgehen vom Nutzer bestätigt.

### 9.1 Problem

Heute ist ein Spieler nur ein Name.
- **Abende:** `training_players.player_id` ist pro Abend neu zufällig. „Max Daub“ hat 13 verschiedene IDs.
- **Ligen:** Sie verknüpfen über den Namen (`src/lib/nameMatching.ts`). Gleicher Name bis auf Groß-/Kleinschreibung, Leerzeichen, Bindestriche, Umlaute und Akzente wird automatisch zugeordnet. Verschreiber, vertauschte Wörter, Zusatz im Namen oder nur der Vorname führen beim Übertragen zu einer Frage pro Liga (Dialog „Ist das dieselbe Person?“); mehrere Kandidaten stehen zur Auswahl, „neuer Spieler“ ist immer möglich.
- **Statistik:** Sie gruppiert nach normalisiertem Namen.

Folgen in den echten Daten:
- **Kurznamen:** In „Jugend und Damen 2026“ spielen an den Abenden „Maxi“, „Tim“, „Erik“ und „Heidi“. In der Liga heißen sie mit vollem Namen.
- **Doppelte Spieler:** In „Ewige Tabelle Training“ stehen „Klaudio Lange“ und „Benjamin Buza“ je zweimal.
- **Verdächtiger Name:** Es gibt den Eintrag „Tim KumpelMaxi“, wahrscheinlich ein Tippfehler. 🛑 Den Nutzer fragen.

### 9.2 Zielmodell (additiv)

```sql
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX players_display_name_unique ON public.players (lower(btrim(display_name)));

CREATE TABLE public.player_aliases (
  alias text PRIMARY KEY,                -- immer lower(btrim(name))
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT
);

ALTER TABLE public.training_players ADD COLUMN IF NOT EXISTS player_ref uuid REFERENCES public.players(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_player_ref uuid REFERENCES public.players(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_player_ref uuid REFERENCES public.players(id);
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS player_ref uuid REFERENCES public.players(id);
-- RLS wie bei den anderen Tabellen: öffentlich lesen, authenticated schreiben
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read players" ON public.players FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write players" ON public.players FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Public read player_aliases" ON public.player_aliases FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write player_aliases" ON public.player_aliases FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
```

Die Namensspalten (`player_name`, `home_player_name` …) bleiben und werden weiter geschrieben. Sie sind die lesbare Kopie und der Rückweg.

### 9.3 Zuordnung der Namen (🛑, menschliche Entscheidung)

1. Erzeuge per `SELECT` eine Liste aller verschiedenen Namen aus `training_players`, `matches` und `player_stats`, mit Häufigkeit und Liga. Laut Backup sind es 34 Namen in Abenden und 210 in Ligen.
2. Schlage Gruppen vor: gleicher Name ohne Groß-/Kleinschreibung und Leerzeichen, Vorname gleich, Ähnlichkeit über `calculateSimilarity` aus `pairingGenerator.ts`. **Nur Vorschläge.**
3. Leg dem Nutzer eine Tabelle vor. **Das App-Repository ist öffentlich, deshalb liegt die Liste nicht hier, sondern im privaten Backup-Repository** (`fun5tyle93/backup-TKMatchmaker`, Ordner `zuordnung/`: `ENTSCHEIDUNGEN.md` und `spieler-zuordnung-vorschlag.csv`). Der Nutzer bestätigt oder korrigiert. Ohne Bestätigung keine Zuordnung. Stand 13.11.2026: bestätigt und dort festgehalten, offen sind nur Klaudio Lange und Benjamin Buza (händische Prüfung). Die Migration D2 enthält **keine Namen**: Sie bildet die Spieler aus den vorhandenen Namen, die wenigen Ausnahmen werden über die Datenbankabfrage gesetzt.
4. Erst danach füllt eine Migration `players`, `player_aliases` und die `*_ref`-Spalten (D2: `20261113130000_players_fill.sql`, idempotent, ohne Namen; die Ausnahmen aus `zuordnung/ausnahmen.sql` im privaten Backup-Repository werden vorher über die Datenbankabfrage eingespielt; Prüfskript `scripts/db-players-check.sql`). Prüfe nach der Migration:
   - **Abende:** Jede Zeile in `training_players` und jedes Spiel hat eine Referenz (`IS NOT NULL`).
   - **Ligen:** Jede Zeile in `player_stats` hat eine Referenz.
   - **Ausnahme:** Bei der Ewigen Tabelle mit 205 historischen Namen dürfen Namen ohne Abend eigene Spieler werden.
   - Die Ausgabe des Fingerabdrucks bleibt identisch, weil nur neue Spalten gefüllt werden.

### 9.4 App

- **Spielererfassung** (Training und Swiss, `PlayerInput`): Es gibt eine Auswahl aus `players` mit Suche, und neue Spieler werden erst nach Bestätigung angelegt („Neuer Spieler ‚Maxi‘ anlegen?“, mit Hinweis auf ähnliche Namen). Neue Abende schreiben `player_ref`, außerdem `player_id = players.id`, damit IDs über Abende stabil sind.
- **Übertragungsdialog:** Der Ähnlichkeitsabgleich entfällt für Spieler mit Referenz. Übertragen wird über `player_ref`.
- **Statistik:** Gruppiert nach `player_ref`. Fehlt die Referenz bei alten Daten, gilt ersatzweise der Name.
- **Liga bearbeiten:** Ein Spieler wird über `player_ref` gewählt.

---

## 10. Schritt E: Ligen aus den Abenden berechnen (später)

**Branch:** `feat/derived-leagues`. Erst nach D.

### 10.1 Problem

`player_stats` sind mitgeführte Summen.
- **Lokale Kopie überschreibt:** `saveLeague` schreibt die **komplette lokale Kopie** einer Liga und löscht Zeilen, die darin fehlen. Bei zwei offenen Geräten oder Tabs gewinnt der Letzte.
- **Kein Rückgängig:** Eine Übertragung lässt sich nicht sauber zurücknehmen.
- **Abweichungen bleiben unbemerkt:** Ob die Summen zu den Abenden passen, prüft niemand.

Der Fingerabdruck zeigt bereits Ungereimtheiten:
- **„Tabelle 2026“:** 711 Siege gegen 713 Niederlagen und 5169:5136 Tore. In einer geschlossenen Liga müssten beide Seiten gleich sein. Ursache sind historische Startwerte und manuelle Änderungen.
- **„Ewige Tabelle Training“:** 36 Siege, 12 Unentschieden und 1 Vizetitel, obwohl dort nur Punkte und Meistertitel gebucht werden sollen. Das ist die Spur der fehlerhaften Swiss-Übertragung.

**Diese Werte werden nicht korrigiert.** Sie werden exakt übernommen, siehe 10.3.

### 10.2 Zielmodell (additiv)

```sql
CREATE TABLE public.league_sessions (            -- "Abend X zählt für Liga Y"
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE RESTRICT,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, session_id)
);
CREATE TABLE public.league_opening_balances (   -- Startbestand: alles, was nicht aus App-Abenden stammt
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_ref uuid NOT NULL REFERENCES public.players(id),
  wins int NOT NULL DEFAULT 0, draws int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0,
  goals_for int NOT NULL DEFAULT 0, goals_against int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0, points_against int NOT NULL DEFAULT 0, goal_difference int NOT NULL DEFAULT 0,
  championships int NOT NULL DEFAULT 0, vice_championships int NOT NULL DEFAULT 0,
  PRIMARY KEY (league_id, player_ref)
);
CREATE TABLE public.league_adjustments (        -- manuelle Korrekturen mit Begründung (ersetzt direktes Editieren)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_ref uuid NOT NULL REFERENCES public.players(id),
  wins int NOT NULL DEFAULT 0, draws int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0,
  goals_for int NOT NULL DEFAULT 0, goals_against int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0, points_against int NOT NULL DEFAULT 0, goal_difference int NOT NULL DEFAULT 0,
  championships int NOT NULL DEFAULT 0, vice_championships int NOT NULL DEFAULT 0,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS champion_ref uuid REFERENCES public.players(id);
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS vice_ref uuid REFERENCES public.players(id);
-- RLS für die drei neuen Tabellen wie in 9.2
```

**Warum `champion_ref` und `vice_ref`:** Punkte und Tore lassen sich jederzeit aus den Ergebnissen berechnen. Meister und Vize hängen aber von der Wertungsregel bei Gleichstand ab (siehe Schritt W). Würde man sie neu berechnen, könnten sich alte Titel ändern, wenn die Regel später angepasst wird. Deshalb werden sie beim Abschluss **eingefroren**.

### 10.3 Rechenregel und Startbestand

**Neue reine Funktion** `computeLeagueStandings(league, sessionsOfLeague, openingBalances, adjustments)` in `src/lib/leagueStandings.ts`:

```
Stand(Spieler) = Startbestand + Σ Beitrag(Abend, Liga) über league_sessions + Σ Korrekturen
```

**`Beitrag(Abend, Liga)`** wird nach den heutigen Regeln berechnet, über `applySessionToLeague` aus 7.5:
- **Statistik eines Abends:**
  - Training: `calculatePlayerStats(session.players, session.matches)`.
  - Swiss: `computeFinalSwissStats`, also Vorrunde plus Playoff.
- **Normale Liga:** W/U/N, Tore, Punkte, Gegenpunkte und Differenz addieren. Meistertitel +1 für `champion_ref`, Vizetitel +1 für `vice_ref`.
- **Ewige Tabelle** (`is_eternal`): nur Punkte, Gegenpunkte und Meistertitel.

**Sortierung** wie heute:
- normale Liga: Punkte, Tordifferenz, geschossene Tore
- Ewige Tabelle: Punkte, Meistertitel

**Startbestand** (Migration, einmalig): `Startbestand = gespeicherter Stand (player_stats) − Σ Beitrag aller bereits übertragenen Abende`. Damit ist der berechnete Stand **per Konstruktion identisch** mit dem heutigen, auch mit allen historischen Ungereimtheiten.
- Der Beitrag braucht die TypeScript-Logik, vor allem für Meister und Vize. Rechne den Startbestand deshalb mit einem Node-Skript (`scripts/compute-opening-balances.mjs`, mit denselben Funktionen, zum Beispiel über `vite-node` oder `tsx`) aus dem frischen Backup. Das Skript erzeugt daraus eine SQL-Migration mit `INSERT`s.
- **Negative Werte im Startbestand:** Sie bedeuten, dass ein Abend mehr beigetragen hat, als in der Liga steht. Das passiert zum Beispiel, wenn beim Übertragen ein Name falsch zugeordnet wurde. In diesem Fall **nicht** stillschweigend übernehmen, sondern dem Nutzer auflisten 🛑.
- **Rückfüllen:** `champion_ref` und `vice_ref` bestehender Abende werden mit der heutigen Logik gefüllt. `league_sessions` wird aus `training_sessions.transferred_to_leagues` gefüllt.

### 10.4 Schattenbetrieb vor dem Umschalten

1. Die App berechnet für jede Liga den neuen Stand und vergleicht ihn mit `player_stats`: zuerst nur in einem Test gegen das Backup, dann in einem Admin-Bereich der Ligenseite („Prüfung: berechnet = gespeichert ✓“).
2. **Erst wenn für alle Ligen jede Zeile und jede Spalte übereinstimmt**, wird umgeschaltet 🛑.

### 10.5 Abschluss in einer Transaktion

Die Postgres-Funktion `complete_session(p_session_id uuid, p_league_ids uuid[], p_champion uuid, p_vice uuid)` (`SECURITY INVOKER`, damit RLS gilt) erledigt in einer Transaktion:
- `is_completed = true`
- `champion_ref` und `vice_ref` setzen
- `league_sessions` einfügen, mit `ON CONFLICT DO NOTHING`, damit sie wiederholbar ist
- `current_session` leeren, wenn es um diesen Abend geht

Sie wird per `supabase.rpc('complete_session', …)` aufgerufen und ersetzt die Einzelschritte in `Training.tsx` (`handleTransferResults`) und `SchweizSystem.tsx`. Einen Abend aus einer Liga zu entfernen bedeutet nur noch, eine Zeile aus `league_sessions` zu löschen (Admin, mit Bestätigung).

### 10.6 Umschalten und Übergang

- **Lesen:** Die Ligen kommen nur noch aus `computeLeagueStandings`.
- **Übergang:** Während des Übergangs schreibt die App `player_stats` zusätzlich weiter (Dual-Write). So bleibt ein Rückweg auf die alte Version offen.
- **Manuelles Bearbeiten** auf der Ligenseite erzeugt künftig eine Zeile in `league_adjustments` mit Pflicht-Begründung. Die Ligenseite zeigt die Korrekturen als Verlauf.
- **Erst Wochen später** und nur nach 🛑 Zustimmung den Dual-Write beenden. `player_stats` und `transferred_to_leagues` **nicht löschen**, sie bleiben als Archiv.

---

## 11. Entscheidungen des Nutzers

### Bereits entschieden (12.11.2026)

- **Wertung bei Gleichstand:** nach DTKV-Spielordnung 2026, siehe Schritt W. Für den Abend gilt § 8 Abs. 3, für die Jahrestabelle analog § 2 Abs. 6.
- **Freilos im Schiedsrichter-Modus:** Der Spieler mit Freilos ist in einem Durchgang frei und im anderen Schiedsrichter (R8, Entscheidung vom 13.11.2026).
- **Halbe Punkte nach Sudden Death:** werden umgesetzt, für die Abschlussrangliste im Schweizer System nach SO § 9 Abs. 6 (6.7, 6.8). Die Punkte sind Vorrunde plus Playoff, die halben Punkte sind nur die Zählformel für Sudden-Death-Spiele. Die Liga-Übertragung bleibt ganzzahlig.
- **Playoff:** Pro Paarung gibt es immer genau ein Spiel, keine Best-of-Varianten.
- **Namen in den Jahrestabellen:** ausgeklammert. Die Ewige Tabelle wird im nächsten Schritt gemeinsam geprüft (Schritt D, Hinweis oben).

### Ergänzte Regeln (vom Nutzer am 12.11.2026 bestätigt)

Diese Regeln stehen nicht in der Spielordnung und gelten verbindlich wie beschrieben:
1. **Völliger Gleichstand um Platz 1 oder 2 am Abend:** Entscheidungsspiel oder -runde mit Sudden Death, ohne Wertung in Punkten und Toren (6.2).
2. **Wertung im Schweizer System:** Punkte pro Spiel → Buchholz → Tordifferenz → geschossene Tore → direkter Vergleich → gespeichertes Los (6.6).
3. **Ewige Tabelle:** Punkte → Meistertitel, danach gleiche Platzzahl (6.5).
4. **Nicht fürs Playoff qualifizierte Spieler** stehen in der Abschlussrangliste in der Reihenfolge der Swiss-Rangliste (6.8).
5. **Keine Rückwirkung:** Alte Abende bleiben `legacy`. Nur neue Abende werden nach DTKV gewertet (6.3).

### Noch offen

1. **Alte Ungereimtheiten in den Ligen** (10.1): Bleiben sie (Standard, über den Startbestand) oder werden sie später über `league_adjustments` mit Begründung korrigiert?
2. **Admin-Recht:** Heute ist jeder angemeldete Nutzer Admin (`isAdmin = !!user`). Das ist sicher, solange die Registrierung aus ist. Soll zusätzlich ein ausdrückliches Admin-Kennzeichen eingeführt werden, das auch die Datenbankregeln prüfen?

---

## 12. Anhang: Befunde mit Belegen

Erhoben am 12.11.2026 auf `main` (Commit `f13e179`) und am Backup vom 06.11.2026.

| Befund | Beleg |
|---|---|
| Swiss: vermeidbare Wiederholungsspiele | Simulation mit je 3000 Turnieren und Zufallsergebnissen: 6 Spieler/4 Runden 47 %, 8/5 80 %, 10/5 69 % der Turniere mit einem Wiederholungsspiel, obwohl eine Auslosung ohne möglich war (Prüfung durch vollständige Suche) |
| Swiss Schiedsrichter-Modus | Simulation mit je 300 Turnieren: bei 6, 7, 10, 11 und 14 Spielern Abbruch in Runde 1 in 100 % der Fälle; bei 8, 9, 12 und 13 Spielern Spieler doppelt in einer Runde (59 bis 95 Fälle) und häufige Abbrüche in späteren Runden; Schiedsrichterliste = eigene Spieler des Durchgangs |
| Swiss Fehler nicht abgefangen | `advanceToNextRound` ruft `generateRefereeRound` ohne `try/catch` auf (`SchweizSystem.tsx`) |
| Swiss nur lokal gespeichert | `localStorage['swiss-session-v1']` (`SchweizSystem.tsx`, `saveSwissSession`) |
| Swiss-Übertragung ignoriert Ewige Tabelle | `SchweizSystem.tsx` `handleTransferResults` prüft `isEternal` nicht; Ewige Tabelle enthält 36/12/36 W/U/N und 1 Vizetitel |
| Doppelte Spielerzeilen | 15 Gruppen in `training_players` mit gleicher `session_id`, `player_id` und gleichem Namen |
| Keine Spieler-Identität | `player_id` pro Abend neu (z. B. 13 IDs für „Max Daub“); Kurznamen in Abenden gegenüber vollen Namen in der Liga; Duplikate „Klaudio Lange“ und „Benjamin Buza“ in der Ewigen Tabelle |
| Ligen nicht geschlossen | „Tabelle 2026“: W 711 gegen N 713, Tore 5169:5136, Punkte 1570:1574 |
| Wertung bei Gleichstand | `calculatePlayerStats` (`pairingGenerator.ts`): Schritt Gegentore wirkungslos, direkter Vergleich nicht transitiv |
| Prototyp neue Auslosung | `scripts/swiss-pairing-prototype.mjs`: n = 4 bis 20 bis zur maximalen Rundenzahl, 0 Wiederholungen, 0 Fälle ohne Auslosung, höchstens 0,6 s pro Runde |
| TypeScript streng | `tsc --strict` liefert genau 1 Fehler (`swissHelpers.ts:117`) |
| Wertung weicht von DTKV ab | `calculatePlayerStats` sortiert Punkte → Tordifferenz → Tore → direkter Vergleich; SO § 8 Abs. 3 verlangt den direkten Vergleich bzw. die Untergruppe **vor** den Toren. Nachrechnung von 24 Abenden: 6 anders geordnet, 1 anderer Sieger, 4 andere Vize |
| Jahrestabelle ohne „weniger verlorene Punkte“ | SO § 2 Abs. 6; an den aktuellen Jahrestabellen ändert die Ergänzung nichts (live geprüft) |
| Playoff nimmt Unentschieden an | keine Prüfung in `PlayoffBracket.tsx`; `playoffMatchWinner` liefert bei Gleichstand `null`, das Playoff hängt; laut SO § 9 Abs. 1 bis 3 gibt es im K.-o.-Spiel kein Unentschieden |
| Abschlussrangliste Swiss falsch | `computeFinalSwissStats`: nach Sieger und Vize alle nach Gesamtpunkten statt nach Ausscheiderunde (SO § 9 Abs. 6); halbe Punkte nach Sudden Death werden nicht erfasst |
| Swiss-Wertung in der SO nicht geregelt | SO § 8 Abs. 5 nennt nur „Platzierung im Schweizer System“, keine Kriterien |
