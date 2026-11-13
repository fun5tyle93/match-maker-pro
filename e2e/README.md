# Browsertests (Vorlagen)

Manuelle Playwright-Skripte gegen den Produktions-Build. Supabase wird gemockt, es wird nie die echte Datenbank benutzt.

```bash
npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort &   # nicht mit pkill -f beenden (trifft die eigene Shell)
node e2e/complete-evening.mjs http://127.0.0.1:4173
```

| Skript | Prüft | Muster |
|---|---|---|
| `complete-evening.mjs` | Abschluss eines Abends mit Übertragung in 1 oder 2 Ligen (`LEAGUES=1`): danach `is_completed = true` | **zustandsbehafteter Mock** (Upsert, PATCH, DELETE, Filter `eq`/`in`) – Vorlage für alle Speichertests |
| `save-failure.mjs` | Verbindungsausfall beim Speichern, Browser-Sicherung, Neuladen, Erholung, Zuschauer schreiben nie | Mock, der Schreibzugriffe gezielt scheitern lässt |
| `pause-e2e.mjs <url> <ausgabeordner>` | Namen passen auf schmale Bildschirme (320 bis 1100 px), PDF- und Excel-Export | Messung im Browser (`evaluate`), Downloads |
| `dtkv-ranking.mjs <url> <ausgabeordner> [backup-data]` | DTKV-Wertung: Entscheidungsdialog bei Gleichstand, Verhalten vor der Migration, Playoff ohne Unentschieden mit Sudden Death, Abschlussrangliste (Turnier, Historie, PDF, Excel), mit Backup-Daten: Sieger der Altabende wie vorher | zustandsbehafteter Mock mit `order`-Unterstützung |
| `swiss-flow.mjs <url> <ausgabeordner>` | Schweizer System: ganzes Turnier ohne Wiederholung, Neuladen, Abschluss mit Ewiger Tabelle; Schiedsrichter-Modus mit Freilos; Übernahme vom Gerät; Konflikt; Datenbank ohne Spalte; Zurücksetzen; nicht auslosbare Runde | zustandsbehafteter Mock mit `order`, `limit`, `not.is.null` und fehlender Spalte |
| `name-matching.mjs <url> [ausgabeordner]` (`W=390` für Handybreite) | Übernahme in Ligen: Schreibweise (Groß-/Kleinschreibung, Leerzeichen) automatisch, Verschreiber als Frage pro Liga mit Vorauswahl, verschiedene Antworten je Liga, nichts doppelt angelegt | zustandsbehafteter Mock |
| `player-identity.mjs <url>` (`NO_REGISTRY=1`) | Feste Spieler-Identität: Übernahme ohne Frage über die Referenz („Erik“ landet auf der Zeile „Erik Schwarz“), gespeicherte Referenzen bleiben erhalten, Statistik führt Schreibweisen zusammen und zeigt den Anzeigenamen | zustandsbehafteter Mock mit `players`, `player_aliases` und `player_ref`-Spalten |
| `player-picker.mjs <url> [ausgabeordner]` (`NO_REGISTRY=1`, `W=390`) | Spielereingabe mit Spielerliste: Vorschläge beim Tippen, Alias, Verschreiber mit Rückfrage („Ja, das ist …“), Neuanlage nach Bestätigung, doppelter Spieler abgelehnt, Abend und Partien speichern Identität und stabile ID, Liga-Verwaltung; ohne Spielerliste freie Eingabe wie früher | zustandsbehafteter Mock mit `players`-Anlage (`Prefer: return=representation`) |
| `league-check.mjs <url> [ausgabeordner]` (`W=390`) | Ligenprüfung „berechnet = gespeichert“: stimmige Liga, Handänderung wird als Abweichung gezeigt, „Als neuen Stand übernehmen“ setzt den Startbestand neu, die gespeicherte Tabelle bleibt unverändert, die Prüfung schreibt nichts | zustandsbehafteter Mock mit zusammengesetztem Schlüssel für `league_opening_balances` |
| `two-devices.mjs <url>` | Zwei Geräte: ein anderes Gerät ändert und ergänzt Liga-Zeilen, während dieses Gerät den Abend überträgt; die fremden Änderungen müssen bleiben, kein `DELETE player_stats` (scheitert mit dem Code vor Punkt 4) | Ersatz-Server mit `in`-Filter |
| `league-page-writes.mjs <url>` | Ligenseite (Admin): Zeile umbenennen und Spieler entfernen schreiben nur die berührte Zeile, genau ein `DELETE`, Änderungen eines anderen Geräts bleiben und werden angezeigt | Ersatz-Server |
| `player-admin.mjs <url> [ausgabeordner]` (`W=390`) | Admin-Seite „Spielerliste“ (`/spieler`): nur für Admins, Suche (auch über andere Namen), Umbenennen, Zusammenführen (auch die Ablehnung bei gleicher Liga), Löschen nur unbenutzter Spieler, Liga-Zeilen ohne Spieler zuordnen; Kopfzeile ohne Überlauf von 320 bis 1440 px | Mock bildet die Datenbankfunktionen `rename_player`/`merge_players`, Fehlercodes und Fremdschlüssel nach |
| `csp-e2e.mjs` | alle Seiten und Exporte laufen unter der echten CSP aus `vercel.json` | eigener kleiner Server mit den Headern aus `vercel.json`; startet ohne Argument (Port 4180) |

Gemeinsame Bausteine:

- **Admin-Login simulieren:** eine Session mit künstlichem JWT unter `sb-swuwjjmspplzfguapvty-auth-token` in den `localStorage` legen (`context.addInitScript`).
- **Supabase mocken:** `context.route('https://swuwjjmspplzfguapvty.supabase.co/**', …)`. GET liefert die Tabellen, POST/PATCH/DELETE verändern sie.
- **Playwright:** `/opt/node-tools/node_modules/playwright`, Chromium mit `executablePath: '/opt/pw-browsers/chromium'` und `--no-sandbox`.

Datenbankfunktionen der Spielerliste testet `scripts/test-player-admin.sql` (Probe-Datenbank, Transaktion mit Rollback): `scripts/db-rehearsal.sh <backup-ordner> supabase/migrations/20261114100000_player_admin.sql`, dann `psql -h /var/tmp/mm-pg -p 54329 -U postgres -v ON_ERROR_STOP=1 -f scripts/test-player-admin.sql` (erwartet: `ALLE FAELLE OK`).
