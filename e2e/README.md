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
| `csp-e2e.mjs` | alle Seiten und Exporte laufen unter der echten CSP aus `vercel.json` | eigener kleiner Server mit den Headern aus `vercel.json`; startet ohne Argument (Port 4180) |

Gemeinsame Bausteine:

- **Admin-Login simulieren:** eine Session mit künstlichem JWT unter `sb-swuwjjmspplzfguapvty-auth-token` in den `localStorage` legen (`context.addInitScript`).
- **Supabase mocken:** `context.route('https://swuwjjmspplzfguapvty.supabase.co/**', …)`. GET liefert die Tabellen, POST/PATCH/DELETE verändern sie.
- **Playwright:** `/opt/node-tools/node_modules/playwright`, Chromium mit `executablePath: '/opt/pw-browsers/chromium'` und `--no-sandbox`.
