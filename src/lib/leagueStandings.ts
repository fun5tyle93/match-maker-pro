/**
 * League standings derived from evenings (docs/UMSETZUNGSPLAN.md Schritt E). Pure functions.
 *
 *   standing(player) = opening balance + sum of the contributions of the evenings that count for the league
 *
 * The contribution of an evening is booked with the same function the transfer uses (applySessionToLeague), so
 * "computed" and "stored" can only differ by what was never booked from an evening.
 */
import { League, Player, PlayerStats, TrainingSession } from '@/types';
import { applySessionToLeague } from './leagueTransfer';
import { sameName } from './nameMatching';
import { rankSession } from './swissRanking';
import { winnerAndRunnerUp } from './ranking';

/** Evening results as they are booked into a league: everybody's numbers, and who won / came second. */
export interface SessionResult {
  stats: PlayerStats[];
  firstPlace?: string;
  secondPlace?: string;
}

/**
 * The booking of one evening, as the transfer does it: training evenings by the rule they were played under.
 * A place that is shared (a tie that was not decided) gives no title.
 */
export function sessionResult(session: TrainingSession): SessionResult {
  if (session.tournamentType === 'swiss') {
    throw new Error(`Schweizer Turnier "${session.name ?? session.id}": Beitrag noch nicht umgesetzt`);
  }
  const ranked = rankSession(session);
  const { winner, runnerUp } = winnerAndRunnerUp(ranked);
  return { stats: ranked.stats, firstPlace: winner?.name, secondPlace: runnerUp?.name };
}

const emptyLeague = (isEternal: boolean): League => ({
  id: 'computed', name: 'computed', year: 0, createdAt: '', playerStats: [], isEternal,
});

/** What the given evenings add up to in a league that starts empty (oldest evening first). */
export function bookSessions(isEternal: boolean, sessions: TrainingSession[]): PlayerStats[] {
  const ordered = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return ordered.reduce((league, session) => {
    const { stats, firstPlace, secondPlace } = sessionResult(session);
    return applySessionToLeague(league, stats, firstPlace, secondPlace, new Map());
  }, emptyLeague(isEternal)).playerStats;
}

const COLUMNS = [
  'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'points', 'pointsAgainst', 'goalDifference',
  'championships', 'viceChampionships',
] as const;
export type Column = (typeof COLUMNS)[number];
export type Numbers = Record<Column, number>;

const numbersOf = (s: PlayerStats): Numbers =>
  Object.fromEntries(COLUMNS.map(c => [c, s[c] ?? 0])) as Numbers;

export interface OpeningRow {
  player: Player;
  /** stored row minus what the evenings contributed */
  opening: Numbers;
  /** the row that is stored in the league now; undefined when evenings contributed but the league has no row */
  stored?: PlayerStats;
  contribution: Numbers;
}

export interface Negative {
  name: string;
  column: Column;
  value: number;
}

/**
 * Opening balance per player: what is in the league but does not come from the evenings. A negative value means
 * an evening contributed more than the league holds (for example a name that was booked on the wrong row);
 * the goal difference is left out, it may be negative.
 * Players are matched by their fixed identity, otherwise by name; with the same name twice in a league the evening
 * counts for the row with the most points, which is where a transfer by name books it.
 */
export function openingBalances(stored: PlayerStats[], booked: PlayerStats[]): { rows: OpeningRow[]; negatives: Negative[] } {
  const target = new Map<PlayerStats, PlayerStats[]>(); // stored row -> contributions
  const orphans: PlayerStats[] = [];
  for (const contribution of booked) {
    // Both have an identity: it decides. Otherwise (a row from before the player list) the name decides.
    const candidates = stored.filter(row =>
      row.player.ref && contribution.player.ref
        ? row.player.ref === contribution.player.ref
        : sameName(row.player.name, contribution.player.name),
    );
    const best = candidates.sort((a, b) => b.points - a.points)[0];
    if (best) target.set(best, [...(target.get(best) ?? []), contribution]);
    else orphans.push(contribution);
  }

  const rows: OpeningRow[] = [];
  const negatives: Negative[] = [];
  const subtract = (name: string, own: Numbers, contribution: Numbers): Numbers =>
    Object.fromEntries(
      COLUMNS.map(c => {
        const value = own[c] - contribution[c];
        // The goal difference is a signed number: a negative opening balance is normal for it
        if (value < 0 && c !== 'goalDifference') negatives.push({ name, column: c, value });
        return [c, value];
      }),
    ) as Numbers;

  const zero = Object.fromEntries(COLUMNS.map(c => [c, 0])) as Numbers;
  const sum = (list: PlayerStats[]): Numbers =>
    list.reduce((acc, s) => Object.fromEntries(COLUMNS.map(c => [c, acc[c] + (s[c] ?? 0)])) as Numbers, zero);

  for (const row of stored) {
    const contribution = sum(target.get(row) ?? []);
    rows.push({ player: row.player, stored: row, contribution, opening: subtract(row.player.name, numbersOf(row), contribution) });
  }
  for (const orphan of orphans) {
    const contribution = numbersOf(orphan);
    rows.push({ player: orphan.player, contribution, opening: subtract(orphan.player.name, zero, contribution) });
  }
  return { rows, negatives };
}
