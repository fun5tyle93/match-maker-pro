# Umsetzungsplan Match Maker Pro

Dieser Plan ist für die Umsetzung durch Claude (Sonnet) in einer späteren Sitzung geschrieben. Er ist absichtlich ausführlich: Lies ihn ganz, bevor du anfängst, und arbeite die Schritte in der angegebenen Reihenfolge ab.

**Die zwei wichtigsten Ziele des Nutzers:**

1. **Es dürfen keine Daten verloren gehen.** Kein Abend, kein Ergebnis, kein Ligastand, kein Meistertitel.
2. **Das Schweizer System muss danach fehlerfrei funktionieren.** In der Vorrunde eines Turniers spielt jedes Paar **höchstens einmal** gegeneinander. Im Playoff darf es wieder zur Begegnung kommen.

Wenn eine Anweisung in diesem Plan mit diesen zwei Zielen kollidiert, gewinnen die Ziele. Halte dann an und frage den Nutzer.

---

## Inhalt

1. [So arbeitest du mit diesem Plan](#1-so-arbeitest-du-mit-diesem-plan)
2. [Die Regeln gegen Datenverlust](#2-die-regeln-gegen-datenverlust)
3. [Projektkontext und Umgebung](#3-projektkontext-und-umgebung)
4. [Werkzeuge](#4-werkzeuge)
5. [Schritt A: Sicherheitsnetz und Hygiene](#5-schritt-a-sicherheitsnetz-und-hygiene)
6. [Schritt B: Schweizer System neu](#6-schritt-b-schweizer-system-neu)
7. [Schritt C: Doppelte Spielerzeilen bereinigen](#7-schritt-c-doppelte-spielerzeilen-bereinigen)
8. [Schritt D: Feste Spieler-Identität](#8-schritt-d-feste-spieler-identität)
9. [Schritt E: Ligen aus den Abenden berechnen, Abschluss in einer Transaktion](#9-schritt-e-ligen-aus-den-abenden-berechnen-abschluss-in-einer-transaktion)
10. [Offene Entscheidungen des Nutzers](#10-offene-entscheidungen-des-nutzers)
11. [Anhang: Befunde mit Belegen](#11-anhang-befunde-mit-belegen)

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

## 6. Schritt B: Schweizer System neu

**Branch:** `feat/swiss-rewrite`. Enthält eine additive Migration (6.6).

### 6.1 Was heute kaputt ist (belegt, siehe Anhang)

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

### 6.2 Fachregeln (verbindlich)

- **R1 Keine Wiederholung:** In der Vorrunde eines Turniers, also in allen Runden und im Schiedsrichter-Modus in beiden Durchgängen, spielt jedes Spielerpaar höchstens einmal gegeneinander. Das Playoff ist ausgenommen.
- **R2 Höchstens ein Freilos:** Bei ungerader Spielerzahl bekommt pro Runde genau ein Spieler ein Freilos, und jeder Spieler höchstens eins pro Turnier.
- **R3 Vollständige Runde:** Jeder Spieler, der kein Freilos hat, spielt pro Runde genau ein Spiel. Niemand fehlt, niemand spielt doppelt. Im Schiedsrichter-Modus spielt er dieses eine Spiel in genau einem der beiden Durchgänge.
- **R4 Ähnliche Stärke:** Runde 1 wird zufällig gelost. Ab Runde 2 wird nach dem aktuellen Tabellenstand gepaart, also so, wie `computeSwissStats` sortiert. Bevorzugt wird ein Gegner mit möglichst ähnlichem Rang, ohne R1 zu verletzen.
- **R5 Freilos nach unten:** Das Freilos geht bevorzugt an den Rangniedrigsten, der noch keins hatte.
- **R6 Vorausschau:** Eine Runde wird nur so gelost, dass alle noch geplanten Runden danach ohne Wiederholung lösbar bleiben. Das Turnier kann also nie in einer Sackgasse landen.
- **R7 Rundenzahl:** Höchstens `n − 1` Runden bei gerader und `n` Runden bei ungerader Spielerzahl, mit jeweils einem Freilos pro Spieler. Die obere Grenze bleibt zusätzlich bei 10. Der Regler passt sich der Spielerzahl an. Ist die gewählte Rundenzahl beim Start zu hoch, wird sie mit Hinweis begrenzt.
- **R8 Schiedsrichter-Modus:**
  - Zuerst wird die ganze Runde nach R1 bis R6 ausgelost.
  - Dann werden die Spiele nach Rang im Reißverschluss auf die Durchgänge verteilt: Spiel 1 (die besten beiden) in Durchgang 1, Spiel 2 in Durchgang 2, Spiel 3 in Durchgang 1 und so weiter.
  - **Schiedsrichter eines Durchgangs** sind die Spieler, die im **anderen** Durchgang spielen.
  - Die Durchgänge können sich um ein Spiel unterscheiden. Das ist gewollt, denn genau das behebt den Absturz bei 6, 7, 10, 11 und 14 Spielern.
- **R9 Klarer Fehlerfall:** Lässt sich eine Runde trotzdem nicht auslosen (darf nach R6 nicht vorkommen), wird **kein** Wiederholungsspiel erzeugt. Stattdessen erscheint eine verständliche Fehlermeldung als Toast, und der Zustand bleibt unverändert.

### 6.3 Algorithmus (siehe `scripts/swiss-pairing-prototype.mjs`)

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

### 6.4 Rundenzahl in der UI (R7)

- **Regler:** `max = Math.min(10, maxSwissRounds(players.length))`, `min = 1`. Die Empfehlung `⌈log₂ n⌉` bleibt, wird aber auf das Maximum begrenzt.
- **Start:** Ist `config.rounds > maxSwissRounds(n)`, wird die Zahl mit Hinweis auf das Maximum gesetzt.
- **Schiedsrichter-Modus:** Er braucht weiterhin mindestens 4 Spieler. Das ist bereits vorhanden.

### 6.5 Speichern in der Datenbank statt nur im Browser

**Ziel:** Ein laufendes Turnier überlebt einen Neustart des Browsers und einen Gerätewechsel. Zuschauer können es mitlesen. Das Verhalten soll dem Training entsprechen.

- **Neue Spalte** `training_sessions.swiss_state jsonb NULL` (Migration 6.6). Sie enthält das komplette `SwissSession`-Objekt (Konfiguration, Runden mit Durchgängen, Schiedsrichtern, Freilosen, Playoff).
- **Speichern:** Jede Änderung speichert mit der vorhandenen Warteschlange `createSaveQueue` (wie `useSessionAutosave`):
  1. `training_sessions` per Upsert: `id = session.id`, `tournament_type = 'swiss'`, `is_completed`, `name`, `date`, `round_count`, `matches_per_pairing = 1`, `transferred_to_leagues`, `swiss_state`.
  2. Spieler und Spiele mit den vorhandenen Funktionen aus `storage.ts` (`syncPlayers`, `syncMatches` über `convertSwissToTrainingSession`). Dann funktionieren Historie, Statistik und Exporte unverändert.
  - Erweitere `saveSessionToDB` dafür um einen optionalen Parameter `swissState`. Ohne ihn darf die Spalte **nicht** überschrieben werden: Lass sie dann im Upsert-Objekt weg und setz sie nicht auf `null`.
  - **Neu:** `saveSwissSession(s)` und `loadRunningSwissSession()`. Letztere liefert den neuesten Abend mit `tournament_type = 'swiss' AND NOT is_completed AND swiss_state IS NOT NULL`.
- **Statusanzeige:** Den Speicherstatus mit `SaveStatusBadge` anzeigen, wie beim Training. Zusätzlich die Browser-Sicherung unter einem eigenen Schlüssel (`matchmaker:unsaved-swiss-session`), bis der Server bestätigt hat.
- **Übernahme vom Gerät** (wichtig gegen Datenverlust): Gibt es beim Laden der Seite als Admin `localStorage['swiss-session-v1']` und in der DB keinen Abend mit dieser `id`, speichere das Turnier einmal in die DB. Erscheint der Toast „Turnier vom Gerät übernommen“, entferne den alten Schlüssel **erst nach** bestätigtem Speichern. Gibt es beide und weichen sie voneinander ab, gewinnt die DB-Version. Die Gerätefassung bleibt dann unter `swiss-session-v1-conflict-<datum>` liegen. Nichts wird stillschweigend gelöscht.
- **Nur Admins speichern.** Zuschauer laden lesend und sehen keine Bearbeitungsknöpfe.
- **Abschluss:** Erst den Abend als abgeschlossen speichern, dann in die Ligen übertragen. Fehlt danach eine Liga, ist das wiederholbar über `transferred_to_leagues`. In Schritt E wird das durch die Transaktion ersetzt.
- **Ewige Tabelle** (Fehler 6.1.6): Die Swiss-Übertragung muss die Regel der Trainingsübertragung übernehmen. Bei `isEternal` werden nur `points`, `pointsAgainst` und `championships` gebucht, neue Spieler mit W/U/N und Toren = 0. Am besten ziehst du beide Übertragungen in eine gemeinsame, getestete Funktion `applySessionToLeague(league, stats, champion, vice)` in `src/lib/leagueTransfer.ts` zusammen. Die Trainingsseite nutzt sie ebenfalls. Bestehende Ligadaten werden **nicht** korrigiert, siehe Entscheidung 10.4.

### 6.6 Migration für Schritt B

```sql
-- supabase/migrations/<timestamp>_swiss_state.sql
-- Stores the running Swiss tournament (config, rounds, passes, referees, byes, playoff) so it survives a browser restart.
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS swiss_state jsonb;
```

Sie ist additiv. Die bestehenden Policies gelten auch für die neue Spalte. Zuerst die Probe (4.1) mit Fingerabdruck vorher und nachher, die Ausgaben müssen identisch sein. Dann 🛑 Zustimmung einholen, dann `apply_migration`, dann den Fingerabdruck live. Die App muss ohne die Spalte weiterlaufen: Fehlt sie, fällt sie auf den `localStorage` zurück und zeigt den Hinweis „Turnier wird nur auf diesem Gerät gespeichert“. Damit funktioniert auch die Vercel-Vorschau vor der Migration.

### 6.7 Tests (Pflicht)

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
   - Die Schiedsrichter jedes Durchgangs sind genau die Spieler des anderen Durchgangs.
   - 0 Wiederholungen, kein Absturz.
3. **Playoff:** Eine Wiederholung aus der Vorrunde ist im Playoff erlaubt. Ein Test zeigt, dass zwei Vorrunden-Gegner im Halbfinale aufeinandertreffen können und die Auslosung trotzdem läuft.
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

## 7. Schritt C: Doppelte Spielerzeilen bereinigen

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

## 8. Schritt D: Feste Spieler-Identität

**Branch:** `feat/player-identity`. Groß, deshalb in Teilschritten mit je eigenem PR, wenn sinnvoll.

### 8.1 Problem

Heute ist ein Spieler nur ein Name.
- **Abende:** `training_players.player_id` ist pro Abend neu zufällig. „Max Daub“ hat 13 verschiedene IDs.
- **Ligen:** Sie verknüpfen über den Namen (Groß-/Kleinschreibung egal), beim Übertragen mit einem Ähnlichkeitsdialog.
- **Statistik:** Sie gruppiert nach normalisiertem Namen.

Folgen in den echten Daten:
- **Kurznamen:** In „Jugend und Damen 2026“ spielen an den Abenden „Maxi“, „Tim“, „Erik“ und „Heidi“. In der Liga heißen sie mit vollem Namen.
- **Doppelte Spieler:** In „Ewige Tabelle Training“ stehen „Klaudio Lange“ und „Benjamin Buza“ je zweimal.
- **Verdächtiger Name:** Es gibt den Eintrag „Tim KumpelMaxi“, wahrscheinlich ein Tippfehler. 🛑 Den Nutzer fragen.

### 8.2 Zielmodell (additiv)

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

### 8.3 Zuordnung der Namen (🛑, menschliche Entscheidung)

1. Erzeuge per `SELECT` eine Liste aller verschiedenen Namen aus `training_players`, `matches` und `player_stats`, mit Häufigkeit und Liga. Laut Backup sind es 34 Namen in Abenden und 210 in Ligen.
2. Schlage Gruppen vor: gleicher Name ohne Groß-/Kleinschreibung und Leerzeichen, Vorname gleich, Ähnlichkeit über `calculateSimilarity` aus `pairingGenerator.ts`. **Nur Vorschläge.**
3. Leg dem Nutzer eine Tabelle vor (gerne als Datei `docs/spieler-zuordnung.csv` im PR): `name | vorschlag_spieler | belege`. Der Nutzer bestätigt oder korrigiert. Ohne Bestätigung keine Zuordnung.
4. Erst danach füllt eine Migration `players`, `player_aliases` und die `*_ref`-Spalten. Prüfe nach der Migration:
   - **Abende:** Jede Zeile in `training_players` und jedes Spiel hat eine Referenz (`IS NOT NULL`).
   - **Ligen:** Jede Zeile in `player_stats` hat eine Referenz.
   - **Ausnahme:** Bei der Ewigen Tabelle mit 205 historischen Namen dürfen Namen ohne Abend eigene Spieler werden.
   - Die Ausgabe des Fingerabdrucks bleibt identisch, weil nur neue Spalten gefüllt werden.

### 8.4 App

- **Spielererfassung** (Training und Swiss, `PlayerInput`): Es gibt eine Auswahl aus `players` mit Suche, und neue Spieler werden erst nach Bestätigung angelegt („Neuer Spieler ‚Maxi‘ anlegen?“, mit Hinweis auf ähnliche Namen). Neue Abende schreiben `player_ref`, außerdem `player_id = players.id`, damit IDs über Abende stabil sind.
- **Übertragungsdialog:** Der Ähnlichkeitsabgleich entfällt für Spieler mit Referenz. Übertragen wird über `player_ref`.
- **Statistik:** Gruppiert nach `player_ref`. Fehlt die Referenz bei alten Daten, gilt ersatzweise der Name.
- **Liga bearbeiten:** Ein Spieler wird über `player_ref` gewählt.

---

## 9. Schritt E: Ligen aus den Abenden berechnen, Abschluss in einer Transaktion

**Branch:** `feat/derived-leagues`. Erst nach D.

### 9.1 Problem

`player_stats` sind mitgeführte Summen.
- **Lokale Kopie überschreibt:** `saveLeague` schreibt die **komplette lokale Kopie** einer Liga und löscht Zeilen, die darin fehlen. Bei zwei offenen Geräten oder Tabs gewinnt der Letzte.
- **Kein Rückgängig:** Eine Übertragung lässt sich nicht sauber zurücknehmen.
- **Abweichungen bleiben unbemerkt:** Ob die Summen zu den Abenden passen, prüft niemand.

Der Fingerabdruck zeigt bereits Ungereimtheiten:
- **„Tabelle 2026“:** 711 Siege gegen 713 Niederlagen und 5169:5136 Tore. In einer geschlossenen Liga müssten beide Seiten gleich sein. Ursache sind historische Startwerte und manuelle Änderungen.
- **„Ewige Tabelle Training“:** 36 Siege, 12 Unentschieden und 1 Vizetitel, obwohl dort nur Punkte und Meistertitel gebucht werden sollen. Das ist die Spur der fehlerhaften Swiss-Übertragung.

**Diese Werte werden nicht korrigiert.** Sie werden exakt übernommen, siehe 9.3.

### 9.2 Zielmodell (additiv)

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
-- RLS für die drei neuen Tabellen wie in 8.2
```

**Warum `champion_ref` und `vice_ref`:** Punkte und Tore lassen sich jederzeit aus den Ergebnissen berechnen. Meister und Vize hängen aber von der Wertungsregel bei Gleichstand ab (siehe 10.1). Würde man sie neu berechnen, könnten sich alte Titel ändern, wenn die Regel später angepasst wird. Deshalb werden sie beim Abschluss **eingefroren**.

### 9.3 Rechenregel und Startbestand

**Neue reine Funktion** `computeLeagueStandings(league, sessionsOfLeague, openingBalances, adjustments)` in `src/lib/leagueStandings.ts`:

```
Stand(Spieler) = Startbestand + Σ Beitrag(Abend, Liga) über league_sessions + Σ Korrekturen
```

**`Beitrag(Abend, Liga)`** wird nach den heutigen Regeln berechnet, über `applySessionToLeague` aus 6.5:
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

### 9.4 Schattenbetrieb vor dem Umschalten

1. Die App berechnet für jede Liga den neuen Stand und vergleicht ihn mit `player_stats`: zuerst nur in einem Test gegen das Backup, dann in einem Admin-Bereich der Ligenseite („Prüfung: berechnet = gespeichert ✓“).
2. **Erst wenn für alle Ligen jede Zeile und jede Spalte übereinstimmt**, wird umgeschaltet 🛑.

### 9.5 Abschluss in einer Transaktion

Die Postgres-Funktion `complete_session(p_session_id uuid, p_league_ids uuid[], p_champion uuid, p_vice uuid)` (`SECURITY INVOKER`, damit RLS gilt) erledigt in einer Transaktion:
- `is_completed = true`
- `champion_ref` und `vice_ref` setzen
- `league_sessions` einfügen, mit `ON CONFLICT DO NOTHING`, damit sie wiederholbar ist
- `current_session` leeren, wenn es um diesen Abend geht

Sie wird per `supabase.rpc('complete_session', …)` aufgerufen und ersetzt die Einzelschritte in `Training.tsx` (`handleTransferResults`) und `SchweizSystem.tsx`. Einen Abend aus einer Liga zu entfernen bedeutet nur noch, eine Zeile aus `league_sessions` zu löschen (Admin, mit Bestätigung).

### 9.6 Umschalten und Übergang

- **Lesen:** Die Ligen kommen nur noch aus `computeLeagueStandings`.
- **Übergang:** Während des Übergangs schreibt die App `player_stats` zusätzlich weiter (Dual-Write). So bleibt ein Rückweg auf die alte Version offen.
- **Manuelles Bearbeiten** auf der Ligenseite erzeugt künftig eine Zeile in `league_adjustments` mit Pflicht-Begründung. Die Ligenseite zeigt die Korrekturen als Verlauf.
- **Erst Wochen später** und nur nach 🛑 Zustimmung den Dual-Write beenden. `player_stats` und `transferred_to_leagues` **nicht löschen**, sie bleiben als Archiv.

---

## 10. Offene Entscheidungen des Nutzers

Diese Punkte nicht selbst entscheiden. Bis zur Entscheidung bleibt das heutige Verhalten.

1. **Wertung bei Gleichstand am Abend:** Heute gilt Punkte → Tordifferenz → geschossene Tore → Gegentore → direkter Vergleich (`calculatePlayerStats`).
   - Der Schritt „Gegentore“ ist wirkungslos, denn bei gleicher Differenz und gleichen Toren sind die Gegentore gleich.
   - Der direkte Vergleich wird paarweise in der Sortierung angewandt. Bei drei Spielern im Kreis ist das Ergebnis zufällig.
   - Bei völligem Gleichstand entscheidet die Reihenfolge der Daten über den Meistertitel.
   - Der Verein sollte festlegen, welche Kriterien in welcher Reihenfolge gelten und was bei völligem Gleichstand passiert (geteilt, Stechen oder Los).
2. **Wertung im Schweizer System:** Heute gilt Punkte pro Spiel → Buchholz → Tordifferenz. Bleibt das so?
3. **Schiedsrichter-Modus:** Pfeift der Spieler mit Freilos in beiden Durchgängen mit? Standard: nein.
4. **Alte Ungereimtheiten in den Ligen** (9.1): Sollen sie bleiben (Standard, über den Startbestand) oder später über `league_adjustments` mit Begründung korrigiert werden?
5. **Namenszuordnung** (8.3): Welche Namen gehören zu derselben Person? Was ist „Tim KumpelMaxi“?
6. **Admin-Recht:** Heute ist jeder angemeldete Nutzer Admin (`isAdmin = !!user`). Das ist sicher, solange die Registrierung aus ist. Soll zusätzlich ein ausdrückliches Admin-Kennzeichen eingeführt werden, das auch die Datenbankregeln prüfen?

---

## 11. Anhang: Befunde mit Belegen

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
