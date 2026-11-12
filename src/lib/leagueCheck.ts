/**
 * The check "computed = stored" for a league (docs/UMSETZUNGSPLAN.md Schritt E, reduced). Pure functions.
 *
 *   computed(player) = opening balance + contributions of the transferred evenings
 *
 * compared with the stored row. A difference means a number in the league was changed by hand, an evening was
 * booked differently, or two devices overwrote each other. Nothing is corrected here; the stored table stays
 * the truth, the check only tells.
 */
import { League, PlayerStats, TrainingSession } from '@/types';
import { bookSessions, Column, Numbers, openingBalances } from './leagueStandings';

export interface Difference {
  name: string;
  column: Column;
  computed: number;
  stored: number;
}

export interface MissingRow {
  name: string;
  /** what the evenings add up to for a player who has no row in the league */
  contribution: Numbers;
}

export interface LeagueCheck {
  /** every row that could be checked has the computed numbers */
  ok: boolean;
  differences: Difference[];
  /** players whom transferred evenings booked but who have no row in the league */
  missingRows: MissingRow[];
  /** rows without a fixed identity: they have no opening balance and cannot be checked */
  notChecked: string[];
  /** transferred Swiss tournaments: their contribution cannot be computed yet, so the result is incomplete */
  unsupported: string[];
  /** rows that were checked */
  checkedRows: number;
}

export const COLUMN_LABEL: Record<Column, string> = {
  wins: 'Siege', draws: 'Unentschieden', losses: 'Niederlagen', goalsFor: 'Tore', goalsAgainst: 'Gegentore',
  points: 'Punkte', pointsAgainst: 'Gegenpunkte', goalDifference: 'Tordifferenz',
  championships: 'Meister', viceChampionships: 'Vize',
};

const COLUMNS = Object.keys(COLUMN_LABEL) as Column[];
const ZERO = Object.fromEntries(COLUMNS.map(c => [c, 0])) as Numbers;

/** Opening balance of a player in a league, by the player's fixed identity (players.id). */
export type OpeningLookup = Map<string, Numbers>;

const storedNumbers = (s: PlayerStats): Numbers =>
  Object.fromEntries(COLUMNS.map(c => [c, s[c] ?? 0])) as Numbers;

/**
 * Checks one league. `sessions` are the evenings that count for it (transferred_to_leagues contains the league).
 * A player who has a row with an identity but no opening balance starts from 0, so a player who was added by hand
 * with numbers shows up as a difference.
 */
export function checkLeague(league: League, sessions: TrainingSession[], openings: OpeningLookup): LeagueCheck {
  const unsupported = sessions.filter(s => s.tournamentType === 'swiss').map(s => s.name ?? s.id);
  const counted = sessions.filter(s => s.tournamentType !== 'swiss');
  const booked = bookSessions(!!league.isEternal, counted);
  const { rows } = openingBalances(league.playerStats, booked);

  const differences: Difference[] = [];
  const missingRows: MissingRow[] = [];
  const notChecked: string[] = [];
  let checkedRows = 0;

  for (const row of rows) {
    if (!row.stored) {
      missingRows.push({ name: row.player.name, contribution: row.contribution });
      continue;
    }
    if (!row.stored.player.ref) {
      notChecked.push(row.stored.player.name);
      continue;
    }
    checkedRows++;
    const opening = openings.get(row.stored.player.ref) ?? ZERO;
    const stored = storedNumbers(row.stored);
    for (const column of COLUMNS) {
      const computed = opening[column] + row.contribution[column];
      if (computed !== stored[column]) differences.push({ name: row.stored.player.name, column, computed, stored: stored[column] });
    }
  }
  return { ok: differences.length === 0 && missingRows.length === 0, differences, missingRows, notChecked, unsupported, checkedRows };
}

/**
 * The opening balances that make the check pass for the league as it is now: stored minus contributions, for every
 * row with a fixed identity ("take over as the new state" after a deliberate manual change).
 */
export function openingsFor(league: League, sessions: TrainingSession[]): { ref: string; opening: Numbers }[] {
  const counted = sessions.filter(s => s.tournamentType !== 'swiss');
  const { rows } = openingBalances(league.playerStats, bookSessions(!!league.isEternal, counted));
  return rows.filter(r => r.stored?.player.ref).map(r => ({ ref: r.stored!.player.ref as string, opening: r.opening }));
}
