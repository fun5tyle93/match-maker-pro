# Match Maker Pro

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

3. UI/UX-Richtlinien für Lovable.ai:

    Intuitiv & Benutzerfreundlich: Einfache Navigation, klare Beschriftungen, minimale Klickpfade.
    Responsives Design: Optimiert für mobile Endgeräte (Smartphones, Tablets).
    Visuelle Hierarchie: Wichtige Informationen (z.B. aktuelle Paarungen, Tabellenstände) sind prominent platziert.
    Feedback: Visuelles Feedback bei Aktionen (z.B. "Ergebnisse gespeichert", "Export erfolgreich").
    Eingabefelder: Leicht bedienbare Eingabefelder für Spielergebnisse (z.B. Zahleneingabe über Zifferntastatur).

Zusätzliche Hinweise für die KI:

    Datenbankstruktur: Die App muss eine robuste Datenbankstruktur implementieren, die Spieler, Trainingsabende (mit Spielen und Ergebnissen) und Gesamttabellen (mit aggregierten Daten) effizient speichert und verknüpft.
    User Management: Es ist kein Login- oder User-Management erforderlich. Die App ist für einen Einzelnutzer konzipiert, der die Daten lokal verwaltet.
    Priorität: Die Kernfunktionen (Paarungsgenerierung, dynamische Tabellen, Ergebnisübertragung) haben höchste Priorität.
    Keine In-App-Käufe oder Werbung: Die App soll werbefrei sein und keine In-App-Käufe enthalten.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://match-maker-league-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/89a11b80-430b-40cc-bbf6-34dff727fb48).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
