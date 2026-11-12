# Match Maker Pro

Meisterschaftstool des **TKC71 Hirschlanden** für Tipp-Kick: Trainingsabende mit automatischer Paarungsgenerierung (Round Robin und Schweizer System mit Playoffs), Ligen (Gesamttabellen), Statistiken und Exporte als PDF und Excel.

**Live-App:** https://match-maker-pro.vercel.app

## Funktionen

- **Training:** Spieler erfassen, Paarungen und Platten (Tische) automatisch zuweisen, Ergebnisse eintragen, Tabelle live aktualisieren, Playoffs spielen.
- **Ligen:** Trainingsabende in eine oder mehrere Gesamttabellen übertragen.
- **Wertung:** Abende nach der DTKV-Spielordnung 2026 (§ 8 Abs. 3: direkter Vergleich bzw. Untergruppe vor den Toren). Abende, die vorher gespielt wurden, behalten ihre damalige Wertung. Im Schweizer System gilt für die Abschlussrangliste § 9 Abs. 6 (Punkte aus Vorrunde und Playoff, Sudden-Death-Sieg 1,5 / Niederlage 0,5).
- **Statistiken:** Rangliste, Formkurve, Direktvergleiche u. a. (nur abgeschlossene Abende).
- **Historie:** abgeschlossene Abende ansehen, bearbeiten, als PDF/Excel exportieren oder drucken.
- **Speichern:** Automatisches Speichern mit Statusanzeige; bei Verbindungsproblemen bleibt eine lokale Sicherung im Browser erhalten.

## Technik

Vite, React 18, TypeScript, Tailwind CSS 3, shadcn/ui (Radix), react-router, Supabase (Datenbank und Login), jsPDF und write-excel-file für die Exporte, Vitest für Tests. Schriften werden selbst ausgeliefert (`@fontsource`), es gibt keine Verbindung zu Google-Servern.

## Entwicklung

Voraussetzung: Node.js 24 und npm.

```sh
npm install --legacy-peer-deps   # --legacy-peer-deps wegen eines npm-Peer-Konflikts
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
npm run lint       # ESLint
npx vitest run     # Tests
```

## Betrieb

- **Hosting:** Vercel. Jeder Push auf `main` wird automatisch produktiv ausgeliefert, jeder Pull Request bekommt eine Vorschau-URL.
- **Datenbank:** Supabase-Projekt `swuwjjmspplzfguapvty`. Das Schema liegt als Migrationen in `supabase/migrations/`.
- **Backup:** Die Free-Variante von Supabase legt keine automatischen Backups an. Daten regelmäßig sichern (z. B. per geplantem Export in ein privates GitHub-Repository).

## Zugriff und Sicherheit

- Alle Tabellen haben Row Level Security: **Lesen** darf jeder, **Schreiben** nur der angemeldete Admin. Der Anon-Key im Code ist öffentlich vorgesehen und gibt nur Leserechte.
- Registrierung ist in Supabase abgeschaltet; es gibt genau einen Admin-Account.
- `vercel.json` setzt Sicherheits-Header (Content-Security-Policy, `X-Frame-Options`, `nosniff`, Referrer- und Permissions-Policy). Neue externe Dienste (Schriften, Skripte, APIs) müssen dort in der CSP freigegeben werden, sonst blockiert der Browser sie.
- Die Seite ist für Suchmaschinen gesperrt (`robots.txt`, `noindex`, `X-Robots-Tag`). Die Linkvorschau (`public/images/tkc71-vorschau.png`) wirbt nur für den Verein.

## Ursprüngliche Anforderungen

1. Kernfunktionen & Anforderungen:

1.1. Trainingsabend-Management:

    1.1.1. Spieler-Erfassung & Paarungsgenerierung:
        Input: Erfassung einer beliebigen Anzahl von Spielern für den aktuellen Trainingsabend.
        Funktion: Automatische, zufällige Generierung von 1-gegen-1-Paarungen für jede Runde.
        Logik (Pausenmodus): Bei ungerader Spieleranzahl: Ein Spieler pro Runde wird zufällig als "pausierend" gekennzeichnet. Dieser Spieler nimmt an dieser Runde nicht teil.
        Logik (Varianz): Sicherstellung maximaler Variation der Gegnerkombinationen und der Heim-/Auswärtszuweisung über die Runden hinweg.
        Input (Spielwiederholungen): Möglichkeit zur Definition, wie oft jeder Spieler gegen jeden anderen Spieler spielen soll (z.B. Hin- und Rückrunde). Die Paarungsgenerierung muss dies berücksichtigen.
    1.1.2. Spiel-Erfassung & Ergebnismanagement:
        Input: Intuitive Eingabe der Spielergebnisse (Tore für Spieler A, Tore für Spieler B) nach jedem Spiel.
        Ansicht: Dedizierte "Trainingsabend-Ansicht" mit allen Spielen des aktuellen Abends, Anzeige der beteiligten Spieler und der eingegebenen Ergebnisse.
    1.1.3. Trainingsabend-Tabelle (Dynamisch):
        Anzeige: Dynamische Echtzeit-Aktualisierung einer Tabelle für den aktuellen Trainingsabend basierend auf den eingegebenen Spielergebnissen.
        Spalten (Reihenfolge bindend):
            Platzierung (automatisch ermittelt)
            Name des Spielers
            Punkte (Format: (Anzahl Siege * 2 + Anzahl Unentschieden * 1) : (Anzahl Niederlagen * 2 + Anzahl Unentschieden * 1))
            Tore (Format: (Geschossene Tore) : (Erhaltene Tore))
            Tordifferenz (Geschossene Tore - Erhaltene Tore)
    1.1.4. Trainingsabend-Status: Option zum Markieren eines Trainingsabends als "Abgeschlossen".

1.2. Ligen-Management (Jahresligen):

    1.2.1. Gesamttabellen-Erstellung & -Verwaltung:
        Input: Möglichkeit zur Erstellung und Benennung mehrerer unabhängiger "Gesamttabellen" (z.B. "Liga 2023", "Liga 2024").
        Funktion: Gesamttabellen sollen über Kalenderjahre hinweg geführt werden können.
        Anzeige: Listenansicht aller angelegten Gesamttabellen.
    1.2.2. Ergebnisübertragung zu Gesamttabellen:
        Trigger: Nach Abschluss eines Trainingsabends: Das System muss den Benutzer proaktiv fragen: "Möchten Sie die Ergebnisse dieses Trainingsabends in eine Gesamttabelle übertragen?"
        Aktion: Bei Bestätigung: Anzeige einer Auswahl aller vorhandenen Gesamttabellen. Der Benutzer kann eine oder mehrere Gesamttabellen auswählen.
        Logik: Die Ergebnisse (Punkte, Tore) des Trainingsabends werden zu den ausgewählten Gesamttabellen addiert.
    1.2.3. Gesamttabellen-Anzeige:
        Anzeige: Dedizierte Ansicht für jede Gesamttabelle.
        Spalten (Reihenfolge bindend):
            Platzierung (automatisch ermittelt)
            Name des Spielers
            Punkte (Format: (Anzahl Siege * 2 + Anzahl Unentschieden * 1) : (Anzahl Niederlagen * 2 + Anzahl Unentschieden * 1))
            Tore (Format: (Geschossene Tore) : (Erhaltene Tore))
            Tordifferenz (Geschossene Tore - Erhaltene Tore)

1.3. Punktesystem (Global):

    Sieg: 2 Punkte
    Unentschieden: 1 Punkt
    Niederlage: 0 Punkte
        Hinweis: Dieses Punktesystem ist für alle Tabellen (Trainingsabend und Gesamtliga) anzuwenden.

2. Export-Funktionen:

    2.1. Export von Trainingsabend-Ergebnissen:
        Option: Aufrufbar aus der "Trainingsabend-Ansicht" eines abgeschlossenen Trainingsabends.
        Formate: Export als XLSX und PDF, inklusive aller Spiele und der finalen Trainingsabend-Tabelle.
    2.2. Export von Gesamttabellen:
        Option: Aufrufbar aus der Ansicht einer spezifischen Gesamttabelle.
        Formate: Export als XLSX und PDF, inklusive der Gesamttabelle.

3. UI/UX-Richtlinien:

    Intuitiv & Benutzerfreundlich: Einfache Navigation, klare Beschriftungen, minimale Klickpfade.
    Responsives Design: Optimiert für mobile Endgeräte (Smartphones, Tablets).
    Visuelle Hierarchie: Wichtige Informationen (z.B. aktuelle Paarungen, Tabellenstände) sind prominent platziert.
    Feedback: Visuelles Feedback bei Aktionen (z.B. "Ergebnisse gespeichert", "Export erfolgreich").
    Eingabefelder: Leicht bedienbare Eingabefelder für Spielergebnisse (z.B. Zahleneingabe über Zifferntastatur).

Zusätzliche Hinweise:

    Datenbankstruktur: Die App muss eine robuste Datenbankstruktur implementieren, die Spieler, Trainingsabende (mit Spielen und Ergebnissen) und Gesamttabellen (mit aggregierten Daten) effizient speichert und verknüpft.
    User Management: Ursprünglich war kein Login vorgesehen. Heute gilt: Lesen ist für alle möglich, Ändern nur für den angemeldeten Admin (siehe „Zugriff und Sicherheit“).
    Priorität: Die Kernfunktionen (Paarungsgenerierung, dynamische Tabellen, Ergebnisübertragung) haben höchste Priorität.
    Keine In-App-Käufe oder Werbung: Die App soll werbefrei sein und keine In-App-Käufe enthalten.
