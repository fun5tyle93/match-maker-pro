/**
 * Finds the player of a league that an evening name belongs to. Pure functions, no React and no database.
 *
 * Players have no fixed identity yet (every evening creates new ids), so the name is the only link between an
 * evening and a league. This module makes that link robust:
 *  - same name apart from case, spaces, hyphens, umlauts or accents ("klaudio  lange", "Müller" / "Mueller")
 *    is the same player and is matched automatically
 *  - a slightly different name (typo, other word order, only the first name, an added note) is never matched
 *    silently; the transfer dialog asks which player is meant
 */

/**
 * Comparable form of a name: lower case, umlauts spelled out (ä -> ae, ß -> ss), other accents removed,
 * everything that is not a letter or digit (spaces, hyphens, dots, brackets) becomes a single space.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The two names are the same player apart from case, spacing, punctuation, umlauts and accents. */
export function sameName(a: string, b: string): boolean {
  const na = normalizeName(a);
  return na !== '' && na === normalizeName(b);
}

/** Edit distance where swapping two neighbouring letters counts as one edit ("Lagne" -> "Lange"). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** A row of a league as far as the matching needs it. */
export interface LeagueRowRef {
  name: string;
  points: number;
  championships: number;
  /** Fixed identity of the player (players.id), if the row has one */
  ref?: string;
}

/**
 * Index of the row for this name, or -1. If the league holds the same name more than once, the row with the most
 * points wins, so new results always land on the same, main row.
 */
export function findRowIndex(rows: { name: string; points: number }[], name: string): number {
  let best = -1;
  rows.forEach((row, index) => {
    if (!sameName(row.name, name)) return;
    if (best === -1 || row.points > rows[best].points) best = index;
  });
  return best;
}

export type CandidateKind =
  /** a letter too many, too few, wrong or swapped */
  | 'typo'
  /** the same words in another order ("Lange Klaudio") */
  | 'reordered'
  /** one name contains all words of the other ("Max Daub" / "Max Daub a.K.") */
  | 'partial'
  /** one of the two is only a first name ("Tim" / "Tim Hecker") */
  | 'firstname';

export interface NameCandidate {
  name: string;
  kind: CandidateKind;
  points: number;
  championships: number;
}

const KIND_ORDER: Record<CandidateKind, number> = { typo: 0, reordered: 0, partial: 1, firstname: 2 };
const MAX_CANDIDATES = 4;

function classify(eveningName: string, rowName: string): { kind: CandidateKind; distance: number } | null {
  const a = normalizeName(eveningName);
  const b = normalizeName(rowName);
  if (a === '' || b === '' || a === b) return null;

  const tokensA = a.split(' ');
  const tokensB = b.split(' ');

  if (tokensA.length > 1 && [...tokensA].sort().join(' ') === [...tokensB].sort().join(' ')) {
    return { kind: 'reordered', distance: 0 };
  }

  // One typo in names of 7+ letters, two from 11; in shorter names a single edit may already be another person
  const length = Math.max(a.length, b.length);
  const allowed = length >= 11 ? 2 : length >= 7 ? 1 : 0;
  if (allowed > 0) {
    const distance = editDistance(a, b);
    if (distance <= allowed) return { kind: 'typo', distance };
  }

  const [small, large] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (large.length > small.length) {
    if (small.length >= 2 && small.every(token => large.includes(token))) return { kind: 'partial', distance: 0 };
    if (small.length === 1 && small[0].length >= 3 && large[0] === small[0]) return { kind: 'firstname', distance: 0 };
  }
  return null;
}

/**
 * Players of a league that the evening name might mean, best first. Rows that are the same name
 * (see `sameName`) are not candidates; they are matched automatically.
 */
export function findNameCandidates(eveningName: string, rows: LeagueRowRef[]): NameCandidate[] {
  const found: (NameCandidate & { distance: number })[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (seen.has(key)) continue; // the same name twice in a league is one candidate
    const hit = classify(eveningName, row.name);
    if (!hit) continue;
    seen.add(key);
    found.push({ name: row.name, kind: hit.kind, points: row.points, championships: row.championships, distance: hit.distance });
  }
  found.sort(
    (x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || x.distance - y.distance || y.points - x.points || x.name.localeCompare(y.name, 'de'),
  );
  return found.slice(0, MAX_CANDIDATES).map(({ name, kind, points, championships }) => ({ name, kind, points, championships }));
}

export interface TransferLeagueRef {
  id: string;
  name: string;
  rows: LeagueRowRef[];
}

/** An evening name that is not in a league yet, but looks like players that are. The user decides. */
export interface NameQuestion {
  leagueId: string;
  leagueName: string;
  eveningName: string;
  candidates: NameCandidate[];
}

/** An evening name that was matched without asking because only case, spacing or umlauts differ. */
export interface AutoMatch {
  leagueId: string;
  eveningName: string;
  leagueRowName: string;
}

export interface TransferPlan {
  questions: NameQuestion[];
  autoMatches: AutoMatch[];
}

/** A player of the evening: the name as typed, and the fixed identity if the player has one. */
export interface EveningPlayerRef {
  name: string;
  ref?: string;
}

/**
 * What has to be decided before an evening can be transferred to the chosen leagues.
 *  - a player with a fixed identity is found by it, whatever the name says, and is never asked about
 *    (a known person that is not in the league yet simply starts there)
 *  - otherwise the name decides: the same name (see `sameName`) is matched, a similar name is asked about
 */
export function planTransferMatches(eveningPlayers: EveningPlayerRef[], leagues: TransferLeagueRef[]): TransferPlan {
  const questions: NameQuestion[] = [];
  const autoMatches: AutoMatch[] = [];
  const seen = new Set<string>();
  const players = eveningPlayers.filter(p => {
    const key = `${p.ref ?? ''}\u0000${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const league of leagues) {
    for (const { name: eveningName, ref } of players) {
      const byRef = ref ? league.rows.findIndex(row => row.ref === ref) : -1;
      const index = byRef >= 0 ? byRef : findRowIndex(league.rows, eveningName);
      if (index >= 0) {
        const rowName = league.rows[index].name;
        if (rowName.trim() !== eveningName.trim()) autoMatches.push({ leagueId: league.id, eveningName, leagueRowName: rowName });
        continue;
      }
      if (ref) continue; // identity known: a new player in this league, nothing to ask
      const candidates = findNameCandidates(eveningName, league.rows);
      if (candidates.length > 0) questions.push({ leagueId: league.id, leagueName: league.name, eveningName, candidates });
    }
  }
  return { questions, autoMatches };
}

/** Key of a question in the answers of the dialog. */
export const questionKey = (q: Pick<NameQuestion, 'leagueId' | 'eveningName'>) => `${q.leagueId}\u0000${q.eveningName}`;

/**
 * The answer that is preselected: a typo or reordered name is very likely the same person; a name that merely
 * contains another or shares the first name is preselected as a new player. `null` means "new player".
 */
export function defaultAnswer(question: NameQuestion): string | null {
  const best = question.candidates[0];
  return best && (best.kind === 'typo' || best.kind === 'reordered') ? best.name : null;
}
