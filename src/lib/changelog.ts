/**
 * Changelog of the app, newest first. One entry per release: version, date (the day the change went live), short text.
 *
 * Versioning (decided by the weight of the change):
 *  - major: the data model or the rules the results are calculated by change (new scoring rules, fixed player identity)
 *  - minor: a new function or a clearly visible change
 *  - patch: a fix, a safety improvement or technical upkeep
 * `kind` says how this version was reached from the one below it; a test keeps the two in step.
 * The first entry is the start of the record, not a statement about earlier work.
 */
export type ChangeKind = 'major' | 'minor' | 'patch' | 'start';

export interface ChangelogEntry {
  version: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  kind: ChangeKind;
  title: string;
  changes: string[];
  /** Pull requests of the repository that make up this release */
  prs: number[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '3.5.0', date: '2026-11-13', kind: 'minor', prs: [41],
    title: 'Dokumentation und Changelog',
    changes: [
      'Die Dokumentationsseite beschreibt alle neuen Funktionen und hat keine veralteten Texte mehr.',
      'Neu: Changelog mit Version, Datum und Kurzbeschreibung.',
    ],
  },
  {
    version: '3.4.0', date: '2026-11-13', kind: 'minor', prs: [40],
    title: 'Ligenprüfung rechnet Schweizer Turniere mit',
    changes: [
      'Die Prüfung „berechnet = gespeichert“ kennt jetzt auch Turniere im Schweizer System und rechnet genau wie die Übertragung.',
      'Das Los bei völligem Gleichstand wird aus dem gespeicherten Turnierstand gelesen.',
    ],
  },
  {
    version: '3.3.1', date: '2026-11-13', kind: 'patch', prs: [39],
    title: 'Ligen: nur geänderte Zeilen schreiben, nie nebenbei löschen',
    changes: [
      'Übertragung und Ligenseite schreiben nur noch die Zeilen, die sie wirklich ändern; die Übertragung liest die Liga vorher frisch.',
      'Änderungen eines zweiten Geräts gehen dadurch nicht mehr verloren, gelöscht wird nur auf ausdrücklichen Wunsch eine einzelne Zeile.',
    ],
  },
  {
    version: '3.3.0', date: '2026-11-13', kind: 'minor', prs: [38],
    title: 'Neue Seite „Spielerliste“',
    changes: [
      'Admins können Spieler umbenennen (alter Name bleibt als anderer Name), ungenutzte löschen und Liga-Zeilen ohne Spieler zuordnen.',
      'Zusammenführen geht überall oder nur in bestimmten Ligen; Zeilen derselben Liga werden über alle zehn Spalten addiert, mit Vorschau.',
      'Doppelte Einträge der Ewigen Tabelle wurden bereinigt (Summe in einer Zeile, mit fester Identität).',
    ],
  },
  {
    version: '3.2.0', date: '2026-11-13', kind: 'minor', prs: [37],
    title: 'Außer Konkurrenz auch im Schweizer System',
    changes: ['Spieler „a.K.“ bekommen auch bei Schweizer Turnieren (mit und ohne Playoff) keinen Ligatitel, der Nächste rückt nach.'],
  },
  {
    version: '3.1.1', date: '2026-11-13', kind: 'patch', prs: [36],
    title: 'Datensicherung deckt alle Tabellen ab',
    changes: [
      'Die Sicherung am 1. und 15. jedes Monats enthält jetzt auch Spieler, andere Namen und Startbestände.',
      'Wiederherstellung: Probelauf prüft vorher, es wird nie etwas gelöscht.',
    ],
  },
  {
    version: '3.1.0', date: '2026-11-12', kind: 'minor', prs: [33, 34],
    title: 'Ligenprüfung „berechnet = gespeichert“',
    changes: [
      'Admins sehen je Liga, ob die gespeicherte Tabelle zu Startbestand und übertragenen Abenden passt, mit Spieler und Spalte.',
      'Spieler „außer Konkurrenz“ (a.K.) bekommen keinen Ligatitel, der Nächste rückt nach.',
    ],
  },
  {
    version: '3.0.0', date: '2026-11-12', kind: 'major', prs: [29, 30, 31, 32],
    title: 'Feste Spieler-Identität',
    changes: [
      'Jede Person hat eine feste Identität mit anderen Schreibweisen; Statistik, Übertragung und Ligen erkennen sie darüber.',
      'Die Spielereingabe schlägt bekannte Spieler vor und fragt vor dem Anlegen eines neuen Namens nach.',
    ],
  },
  {
    version: '2.2.0', date: '2026-11-12', kind: 'minor', prs: [28],
    title: 'Namenserkennung bei der Übertragung',
    changes: ['Gleiche Namen (Groß-/Kleinschreibung, Umlaute, Leerzeichen) werden automatisch erkannt, ähnliche je Liga erfragt.'],
  },
  {
    version: '2.1.1', date: '2026-11-12', kind: 'patch', prs: [27],
    title: 'Doppelte Spielerzeilen am Abend entfernt',
    changes: ['Doppelte Einträge eines Spielers an einem Abend wurden bereinigt; die Datenbank lässt sie nicht mehr zu.'],
  },
  {
    version: '2.1.0', date: '2026-11-12', kind: 'minor', prs: [26],
    title: 'Schweizer System überarbeitet',
    changes: [
      'Keine Wiederholungspaarungen, repariertes Freilos und Schiedsrichter-Modus.',
      'Der Turnierstand wird in der Datenbank gespeichert.',
    ],
  },
  {
    version: '2.0.0', date: '2026-11-12', kind: 'major', prs: [25],
    title: 'Wertung nach DTKV-Spielordnung 2026',
    changes: [
      'Tagestabelle, Liga und Schweizer Abschlussrangliste nach den neuen Regeln (direkter Vergleich, Entscheidungsspiele, Sudden Death).',
      'Entscheidungsdialog bei völligem Gleichstand um Platz 1 oder 2.',
    ],
  },
  {
    version: '1.4.1', date: '2026-11-12', kind: 'patch', prs: [24],
    title: 'Sicherheitsnetz für Änderungen',
    changes: ['Strenge Typprüfung, automatische Tests bei jeder Änderung, toten Code entfernt.'],
  },
  {
    version: '1.4.0', date: '2026-11-07', kind: 'minor', prs: [20, 21],
    title: 'Pausierender Spieler und PDF-Feinschliff',
    changes: [
      'Der pausierende Spieler wird in der App, im PDF und in Excel angezeigt; Namen passen besser auf Handys.',
      'PDF: Datum im Kopf der Trainings-Exporte entfernt, „Stand:“ im Ligen-Export.',
    ],
  },
  {
    version: '1.3.1', date: '2026-11-06', kind: 'patch', prs: [19],
    title: 'Abgeschlossene Abende fehlten in der Historie',
    changes: ['Abgeschlossene Abende werden in der Historie wieder angezeigt.'],
  },
  {
    version: '1.3.0', date: '2026-11-02', kind: 'minor', prs: [17, 18],
    title: 'Datenschutz und Sicherheit',
    changes: [
      'Schriften werden selbst ausgeliefert, eigene Linkvorschau, Suchmaschinen bleiben draußen.',
      'Sicherheits-Header, Zoomen ist erlaubt.',
    ],
  },
  {
    version: '1.2.1', date: '2026-10-26', kind: 'patch', prs: [8, 9, 10, 11, 12, 16],
    title: 'Technik aktualisiert',
    changes: [
      'Neue Hauptversionen von Vite, React Router, ESLint, Vitest, sonner und lucide-react; Ungenutztes entfernt.',
      'Die Aussagen zu „Echtzeit“ wurden entfernt, weil sie nicht stimmten.',
    ],
  },
  {
    version: '1.2.0', date: '2026-10-26', kind: 'minor', prs: [5, 6, 7, 13, 14, 15],
    title: 'Statistiken, Tische, schnelleres Laden',
    changes: [
      'Neue Seite „Statistiken“ (Siegquote, Form, Direktvergleich).',
      'Tische wechseln zwischen den Durchgängen und werden überall gespeichert angezeigt.',
      'Historie und Ligen laden schneller; PDF und Excel werden erst beim Export geladen, Exporte aufgeräumt.',
      'Speichern ist sicherer, überall korrekte Mehrzahl und „Platte“.',
    ],
  },
  {
    version: '1.1.0', date: '2026-10-23', kind: 'minor', prs: [2, 3, 4],
    title: 'Schreibschutz und Tischnummern',
    changes: [
      'Schreibzugriffe sind serverseitig strenger geschützt (Row Level Security).',
      'Tischnummern werden gespeichert statt aus der Listenposition abgeleitet; Sicherheitsupdates der Abhängigkeiten.',
    ],
  },
  {
    version: '1.0.0', date: '2026-07-28', kind: 'start', prs: [1],
    title: 'Beginn der Aufzeichnung: Schweizer System',
    changes: ['Schweizer System mit Wiederholungsschutz, Ausgleich beim Schiedsrichter, Freilos und Playoff-Setzung.'],
  },
];

/** The newest version. */
export const CURRENT_VERSION = CHANGELOG[0].version;

/** The version that follows `from` when the change is of the given kind. */
export function nextVersion(from: string, kind: Exclude<ChangeKind, 'start'>): string {
  const [major, minor, patch] = from.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
