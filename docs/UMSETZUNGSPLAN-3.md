# Umsetzungsplan 3: Nacharbeiten nach Plan 2

Stand: 13.11.2026. Ergebnis der Prüfung von Plan 2. Drei kleine Nacharbeiten, **keine Datenbankänderung**.

| Teil | Inhalt | Repository | Branch |
|---|---|---|---|
| A | Zusammenführen-Dialog: Hinweis auf die Ligenprüfung und Warnung beim Teil-Zusammenführen; zwei veraltete Doku-Stellen; Changelog 3.5.1 | App `fun5tyle93/match-maker-pro` | `fix/merge-dialog-hints` |
| B | Unversionierte SQL-Datei der Zusammenlegung ablegen, Entscheidungsliste nachtragen | privat `fun5tyle93/backup-TKMatchmaker` | `chore/zuordnung-zusammenlegung` |

Reihenfolge: erst A komplett (bis Merge und Deployment), dann B. Die Teile hängen nicht voneinander ab.

---

## 0. Arbeitsweise (gilt für beide Teile)

- Mit dem Nutzer Deutsch; Code-Kommentare und Commit-Nachrichten Englisch. Commit-Nachrichten enden mit den Attributionszeilen, die die Sitzung vorgibt.
- **Keine echten Namen im App-Repository** (öffentlich). Auch dieser Plan nennt keine. In Teil B (privat) sind echte Namen erlaubt.
- **PR nur per REST** (GraphQL ist blockiert):
  `gh api repos/<owner>/<repo>/pulls -f title="..." -f head=<branch> -f base=main -F body=@<datei> --jq .number`
- **Merge** (Vorgabe des Nutzers vom 13.11.2026: nach grünen Prüfungen anlegen, mergen, weitermachen):
  `gh api repos/<owner>/<repo>/pulls/<N>/merge -X PUT -f merge_method=merge -f commit_title="<Titel> (#<N>)"`
  Vorher `gh api repos/<owner>/<repo>/pulls/<N> --jq '{mergeable,mergeable_state}'` muss `true`/`clean` zeigen, und im App-Repository müssen der Check `check` (CI) und der Status `Vercel` auf `success` stehen:
  `gh api repos/fun5tyle93/match-maker-pro/commits/<head-sha>/check-runs --jq '.check_runs[]|"\(.name): \(.conclusion)"'`
  `gh api repos/fun5tyle93/match-maker-pro/commits/<head-sha>/status --jq '.statuses[]|"\(.context): \(.state)"'`
  Zum Warten das Monitor-Werkzeug mit einer Schleife verwenden, kein `sleep` im Vordergrund.
- **Branches löschen geht nicht** (Proxy). Am Ende dem Nutzer die gemergten Branches nennen.
- **Changelog:** Jede Änderung an der App bekommt vor dem Merge einen Eintrag in `src/lib/changelog.ts` (siehe A4). Reine Planungs-PRs und das private Backup-Repository bekommen keinen Eintrag; der Changelog beschreibt nur, was sich an der App ändert.
- **Vorschau-Server:** `npm run build`, dann im Hintergrund `npx vite preview --port 4173 --host 127.0.0.1`. **Nie** `pkill -f "vite preview"` (beendet die Sitzung). Einen alten Server mit `python3 /home/user/fun5tyle93/scratchpad_out/killpreview.py` beenden, falls die Datei existiert; sonst einen anderen Port nehmen (z. B. 4174) und den Tests diese URL geben.
- **Ausgangswerte vor Teil A:** 469 Unit-Tests grün, `npx tsc --noEmit -p tsconfig.app.json` ohne Ausgabe, `npx eslint .` meldet 17 Fehler / 6 Warnungen. Diese Werte dürfen nicht schlechter werden.

---

## Teil A: App

### A0. Branch

```bash
cd /home/user/fun5tyle93/match-maker-pro
git checkout main && git pull origin main
git checkout -b fix/merge-dialog-hints
```

### A1. `src/pages/Players.tsx`: Erfolgsmeldung mit Hinweis

**Befund:** Nach „Zuordnen“ steht der Hinweis auf die Ligenprüfung im Bestätigungsdialog, nach „Zusammenführen“ fehlt er (Plan 2, Abschnitt 3.5 Punkt 4 verlangt ihn für beide).

1. Ganz oben in der Datei, unter der Konstante `statLine`, eine Konstante ergänzen:
   ```ts
   /** Shown after merging or assigning: the league check tells whether the stored numbers still add up. */
   const CHECK_HINT = 'Bitte in den betroffenen Ligen die Prüfung „berechnet = gespeichert“ ansehen.';
   ```
2. Die Hilfsfunktion `perform` (heute `const perform = async (action, task, success): Promise<boolean> => { ... toast.success(success); ... }`) bekommt einen vierten, optionalen Parameter `hint?: string`. Die Zeile `toast.success(success);` wird zu:
   ```ts
   toast.success(success, hint ? { description: hint } : undefined);
   ```
   Sonst bleibt `perform` unverändert.
3. Aufruf beim Zusammenführen (im `onClick` des Knopfs „Zusammenführen“, heute `perform('merge', () => mergePlayers(...), \`„${merging.displayName}“ ist jetzt …\`)`): als vierten Parameter `CHECK_HINT` übergeben. Der Text der Erfolgsmeldung (dritter Parameter) bleibt **wörtlich** gleich, der Browsertest sucht ihn.
4. Aufruf beim Zuordnen (im `onClick` von `AlertDialogAction` im Dialog „Zeile zuordnen?“, heute `perform('assign', () => assignLeagueRow(...), 'Zeile zugeordnet')`): ebenfalls `CHECK_HINT` als vierten Parameter.
5. Umbenennen und Löschen bekommen keinen Hinweis.

### A2. `src/pages/Players.tsx`: Hinweis und Warnung im Zusammenführen-Dialog

**Befund:** Beim Teil-Zusammenführen („Nur in bestimmten Ligen“) bleibt der Quellspieler bestehen. Die Übertragung sucht in einer Liga zuerst über die feste Identität, dann über den Namen (`applySessionToLeague` in `src/lib/leagueTransfer.ts`). Nach dem Teil-Zusammenführen hat der Quellspieler in den gewählten Ligen keine Zeile mehr; ein künftiger Abend mit ihm legt dort also wieder eine eigene Zeile an (außer der Name ist gleich dem Namen des Ziels). Der Dialog sagt das bisher nicht.

Im Merge-Dialog (Kommentar `{/* Merge */}`) steht im Zweig „Ziel gewählt“ heute diese Zeile:
```tsx
<p className="text-xs text-muted-foreground">Das lässt sich nicht automatisch rückgängig machen. Die Zahlen bitte danach kurz prüfen.</p>
```
Diese **eine Zeile** wird ersetzt durch:
```tsx
{mergeScope === 'some' && (
  <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive" data-testid="merge-partial-warning">
    Achtung: „{merging?.displayName}“ bleibt als eigener Spieler bestehen. Abende, die künftig mit „{merging?.displayName}“
    übertragen werden, legen in den gewählten Ligen wieder eine eigene Zeile an. Ist es dieselbe Person, besser
    „Überall – ganz zusammenführen“ wählen.
  </p>
)}
<p className="text-xs text-muted-foreground" data-testid="merge-check-hint">
  Das lässt sich nicht automatisch rückgängig machen. Bitte danach in den betroffenen Ligen die Prüfung
  „berechnet = gespeichert“ ansehen und bei Bedarf „Als neuen Stand übernehmen“.
</p>
```
Nichts sonst am Dialog ändern (Auswahl, Vorschau, Knöpfe bleiben).

### A3. `e2e/player-admin.mjs`: neue Prüfungen

Die Datei hat eine Funktion `check(name, ok, extra)` und die Variable `dialog = page.getByRole('dialog')`. Drei Stellen ergänzen; vorhandene Prüfungen nicht ändern.

1. **Ganz zusammenführen, vor dem Klick:** direkt **nach** der Zeile, die mit `check('Vorschau: Liga Zwei wird übernommen (Anna hat dort keine Zeile)'` beginnt, einfügen:
   ```js
   check('Zusammenführen: Hinweis auf die Ligenprüfung steht im Dialog', (await dialog.getByTestId('merge-check-hint').innerText()).includes('berechnet = gespeichert'));
   check('Zusammenführen „Überall“: keine Warnung zu künftigen Abenden', await dialog.getByTestId('merge-partial-warning').count() === 0);
   ```
2. **Ganz zusammenführen, nach dem Klick:** direkt **nach** der Zeile `await row('Anni Test').waitFor({ state: 'detached', timeout: 5000 });` einfügen:
   ```js
   check('Zusammenführen: Erfolgsmeldung nennt die Ligenprüfung', await page.getByText('Bitte in den betroffenen Ligen die Prüfung „berechnet = gespeichert“ ansehen.', { exact: true }).first().isVisible());
   ```
3. **Teil-Zusammenführen:** direkt **nach** der Zeile `await dialog.getByRole('radio', { name: /Nur in bestimmten Ligen/ }).click();` einfügen:
   ```js
   check('Teil-Zusammenführen: Warnung zu künftigen Abenden mit dem Namen der Quelle', (await dialog.getByTestId('merge-partial-warning').innerText()).includes('„Dora Test“ bleibt als eigener Spieler bestehen'));
   ```

Erwartet: Der Test meldet danach **55** `PASS` (vorher 51) und kein `FAIL`, bei `W=900` und bei `W=390`.

### A4. `src/lib/changelog.ts`: Eintrag 3.5.1

Ganz oben in das Array `CHANGELOG` (vor den Eintrag `3.5.0`) einfügen. `date` ist der Tag, an dem du mergst, im Format `YYYY-MM-DD`; `prs` zunächst leer lassen und nach dem Anlegen des PRs nachtragen (siehe A6).
```ts
{
  version: '3.5.1', date: 'YYYY-MM-DD', kind: 'patch', prs: [],
  title: 'Zusammenführen: Hinweise ergänzt',
  changes: [
    'Nach dem Zusammenführen und Zuordnen weist die App auf die Ligenprüfung „berechnet = gespeichert“ hin.',
    'Beim Zusammenführen nur in bestimmten Ligen warnt der Dialog: künftige Abende des alten Spielers legen dort wieder eine eigene Zeile an.',
  ],
},
```
Der Test `src/lib/__tests__/changelog.test.ts` prüft, dass `3.5.1` aus `3.5.0` per `patch` folgt und das Datum nicht älter ist. Er muss grün sein.

### A5. Veraltete Doku-Stellen

1. **`docs/UMSETZUNGSPLAN.md`**, im Absatz, der mit `> **Stand 13.11.2026:** Der Nutzer will von E nur die` beginnt (Abschnitt zu Schritt E). Den **letzten Satz** dieses Absatzes
   > Nicht geprüft werden Zeilen ohne feste Identität (zurzeit die vier doppelten der Ewigen Tabelle) und Schweizer Turniere (Beitrag noch nicht umgesetzt).

   ersetzen durch:
   > Nicht geprüft werden Zeilen ohne feste Identität (Stand 13.11.2026: keine mehr, die doppelten Zeilen der Ewigen Tabelle sind zusammengelegt und zugeordnet). Schweizer Turniere werden seit Umsetzungsplan 2, Punkt 5 mitgerechnet (gemeinsamer Rechenkern `src/lib/swissFinal.ts`).

   Prüfen mit `grep -n "Beitrag noch nicht umgesetzt" docs/UMSETZUNGSPLAN.md`: danach keine Ausgabe.
2. **`e2e/README.md`**, Zeile mit `` `player-admin.mjs <url> [ausgabeordner]` ``: den Teil
   `Zusammenführen (auch die Ablehnung bei gleicher Liga)`
   ersetzen durch:
   `Zusammenführen (ganz oder nur in gewählten Ligen, gleiche Liga wird über alle zehn Spalten addiert, Vorschau je Liga, Hinweis auf die Ligenprüfung, Warnung beim Teil-Zusammenführen)`
   Prüfen mit `grep -n "Ablehnung bei gleicher Liga" e2e/README.md`: danach keine Ausgabe.

### A6. Prüfen, Mutationsproben, PR, Merge

1. Prüfungen:
   ```bash
   npx tsc --noEmit -p tsconfig.app.json      # keine Ausgabe
   npx vitest run                              # 469 Tests grün
   npx eslint . 2>&1 | tail -2                # höchstens 17 Fehler / 6 Warnungen
   npm run build
   ```
   Vorschau-Server starten (siehe Abschnitt 0), dann:
   ```bash
   W=900 node e2e/player-admin.mjs http://127.0.0.1:4173 <scratchpad>/shots   # 55 PASS, 0 FAIL
   W=390 node e2e/player-admin.mjs http://127.0.0.1:4173 <scratchpad>/shots   # 55 PASS, 0 FAIL
   node e2e/csp-e2e.mjs <scratchpad>/shots                                     # Exit 0
   ```
   `csp-e2e.mjs` meldet unter „PROBLEME“ immer einen `pageerror` aus dem Druck-Tab (`setItem` von null) und die beabsichtigten Gegenproben (example.com, Inline-Script). Das ist der Stand von `main` und kein Fehler dieses PRs.
2. **Mutationsproben** (Datei vorher kopieren, danach wiederherstellen und mit `diff` prüfen, dass sie gleich ist; nach jeder Mutation `npm run build`):
   - in `Players.tsx` die Bedingung `mergeScope === 'some' &&` durch `false &&` ersetzen → die Prüfung „Teil-Zusammenführen: Warnung …“ muss `FAIL` melden.
   - in `perform` `hint ? { description: hint } : undefined` durch `undefined` ersetzen → die Prüfung „Zusammenführen: Erfolgsmeldung nennt die Ligenprüfung“ muss `FAIL` melden.
   Danach wiederherstellen, neu bauen, `player-admin.mjs` noch einmal: 55 `PASS`.
3. Bildschirmfoto des Dialogs „Nur in bestimmten Ligen“ mit Warnung bei 390 px: `player-admin.mjs` schreibt es schon als `<scratchpad>/shots/player-admin-merge-partial-390.png`. Dem Nutzer mit dem Datei-Werkzeug zeigen (Status `normal`, Anzeige `render`).
4. Commit (Englisch), `git push -u origin fix/merge-dialog-hints`.
5. PR anlegen. Titel: `Zusammenführen: Hinweis auf die Ligenprüfung und Warnung beim Teil-Zusammenführen`. Text mit den Abschnitten „Was“ (A1, A2, A5, Changelog 3.5.1), „Tests“ (Zahlen aus Schritt 1 und die beiden Mutationsproben), keine Datenbankänderung; am Ende die Fußzeile, die die Sitzung für PR-Texte vorgibt.
6. Die PR-Nummer in `src/lib/changelog.ts` beim Eintrag `3.5.1` in `prs: [<N>]` eintragen, `npx vitest run src/lib/__tests__/changelog.test.ts` (grün), committen („Changelog: add the pull request number to 3.5.1“), pushen.
7. Auf CI `check` = `success` und `Vercel` = `success` für den neuesten Commit des PRs warten, dann mergen (Abschnitt 0).
8. Produktions-Deployment prüfen: mit dem Vercel-Werkzeug `list_deployments` (Projekt `prj_drUZwCVyzlx1KIz27r1oANwJorej`, Team `team_kD9aCA9lVgsoNuAtPmK9hswl`) das Deployment mit `githubCommitRef: main` und dem Merge-Commit suchen und mit `get_deployment` warten, bis `readyState` = `READY`.

---

## Teil B: privates Backup-Repository

**Befund:** Die SQL-Datei, mit der die beiden doppelten Einträge der Ewigen Tabelle am 13.11.2026 zusammengelegt wurden, liegt im lokalen Klon unversioniert in `zuordnung/`. Die Entscheidungsliste `zuordnung/ENTSCHEIDUNGEN.md` führt die beiden Fälle noch als „offen“.

### B1. Branch

Der lokale Klon steht noch auf einem alten, schon gemergten Branch. Die unversionierte Datei bleibt beim Wechsel erhalten.
```bash
cd /home/user/backup-tkmatchmaker
git status --short          # zeigt genau eine Zeile: ?? zuordnung/<dateiname>.sql
git fetch origin main
git checkout main && git pull origin main
git checkout -b chore/zuordnung-zusammenlegung
git status --short          # dieselbe ?? -Zeile wie oben
```
Zeigt `git status` etwas anderes als genau diese eine Datei: anhalten und dem Nutzer berichten, nichts committen.

### B2. SQL-Datei prüfen (nicht ändern)

Die Datei vollständig lesen. Sie muss enthalten: einen Kopfkommentar (was, warum, Schutzprüfungen), einen `DO $$ … $$;`-Block mit den Prüfungen „sehen nicht aus wie erwartet“, „nicht genau einmal in players“, „schon eine Zeile mit ID“, und am Ende Kommentarzeilen `-- ERWARTET danach`. **Nicht ausführen** (sie ist live schon gelaufen; ein zweiter Lauf bricht absichtlich ab). Inhalt nicht verändern.

### B3. `zuordnung/ENTSCHEIDUNGEN.md` nachtragen

1. In der Tabelle unter „## Festgelegte Zuordnungen“ gibt es genau zwei Zeilen, deren Spalte „Spieler (display_name)“ den Wert `offen` hat und deren Spalte „Entscheidung“ `vorerst ausgeklammert, wird händisch geprüft` lautet. In **beiden** Zeilen:
   - Spalte „Spieler (display_name)“: `offen` ersetzen durch den Namen aus der ersten Spalte **ohne** den Klammerzusatz „(2 Zeilen in der Ewigen Tabelle)“.
   - Spalte „Entscheidung“ ersetzen durch:
     `Zusammengelegt am 13.11.2026 auf Wunsch des Nutzers: zweiter Eintrag auf den ersten (mit mehr Punkten) addiert, alle zehn Spalten; zweite Zeile gelöscht; die Zeile hat die feste Spieler-ID. SQL: zuordnung/<dateiname>.sql. Die Werte prüft der Nutzer von Hand und übernimmt sie danach in der Ligenprüfung („Als neuen Stand übernehmen“).`
     (`<dateiname>` = der echte Dateiname aus B1.)
2. Unter „## Folgen für die Migration (D2)“ den **letzten** Spiegelstrich (er beginnt mit den beiden Namen und endet mit „… wenn die händische Prüfung abgeschlossen ist.“) ersetzen durch:
   `- Die beiden doppelten Einträge der Ewigen Tabelle sind am 13.11.2026 zusammengelegt und zugeordnet (siehe Tabelle oben). Danach gibt es keine Liga-Zeile ohne feste Identität mehr.`
3. Sonst nichts an der Datei ändern.

### B4. Tests, Commit, PR, Merge

1. Die Tests des Backup-Repositorys laufen lassen (sie dürfen durch diese Änderung nicht berührt werden):
   ```bash
   bash tests/test-backup.sh
   node tests/test-restore.mjs
   bash tests/test-watchdog.sh
   ```
   Jeder muss ohne `FAIL` enden. Scheitert einer, prüfen, ob er auch auf `main` ohne diese Änderung scheitert; wenn ja, dem Nutzer melden und trotzdem weitermachen (Teil B ändert nur Text und eine SQL-Datei).
2. `git add zuordnung/ENTSCHEIDUNGEN.md zuordnung/<dateiname>.sql` (nur diese beiden), Commit auf Englisch, z. B. „Record the merge of the two duplicate eternal-table rows (SQL and decision)“, `git push -u origin chore/zuordnung-zusammenlegung`.
3. PR per REST an `fun5tyle93/backup-TKMatchmaker` (Basis `main`), Titel „Zuordnung: Zusammenlegung der doppelten Einträge der Ewigen Tabelle dokumentiert“. Text: was abgelegt wurde, dass die SQL-Datei live am 13.11.2026 gelaufen ist und nicht erneut ausgeführt werden soll, Ergebnis der Tests. Fußzeile wie vorgegeben.
4. Das Backup-Repository hat keine Vercel-Vorschau. Mergen, sobald `mergeable_state` = `clean` ist und vorhandene Checks (falls es welche gibt) grün sind.

---

## Abnahme

- App: PR gemergt, Produktions-Deployment `READY`, Changelog zeigt oben `3.5.1` mit PR-Nummer, `player-admin.mjs` 55/55 bei 900 und 390 px, 469 Unit-Tests grün, Lint nicht schlechter als 17/6.
- `grep` aus A5 liefert in beiden Dateien keine Treffer mehr.
- Backup-Repository: PR gemergt, `git status` im Klon ist sauber, `ENTSCHEIDUNGEN.md` enthält kein `offen` mehr in der Tabelle.
- Abschlussbericht an den Nutzer (Deutsch, kurz): was gemacht wurde, Links zu beiden PRs, Ergebnis der Mutationsproben, gemergte Branches zum Löschen (`fix/merge-dialog-hints`, `chore/zuordnung-zusammenlegung`, `docs/implementation-plan-3`), und die offenen Punkte beim Nutzer: doppelte Einträge der Ewigen Tabelle von Hand prüfen und „Als neuen Stand übernehmen“; Entscheidung Admin-Kennzeichen; „Leaked Password Protection“ in Supabase; Dependabot-Hinweis; gemergte Branches löschen.

## Ausdrücklich nicht Teil dieses Plans

- Keine Migration, keine Datenkorrektur, kein eindeutiger Index auf (Liga, `player_id`) (das wäre eine Datenbankänderung und braucht die Freigabe des Nutzers).
- Keine weiteren Umbauten am Dialog, an der Merge-Funktion oder an anderen Seiten.
- Die SQL-Datei aus Teil B nicht ausführen.
