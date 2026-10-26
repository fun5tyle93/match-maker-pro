import { TrainingSession } from '@/types';
import { calculatePlayerStats } from './pairingGenerator';
import { sortMatches } from './tables';
import { getPlayoffFinalists, getSwissMatches, PLAYOFF_PLACEHOLDER_PREFIX, toPlayoffMatches } from './tournamentPhases';

// Statistics are built from the matches of the finished evenings in the history.
// Players get a new id on every evening, so a player is recognised by the name.

export type GameResult = 'W' | 'D' | 'L';

/** From this many games on, win rate and average points count for a ranking. */
export const MIN_GAMES_FOR_RANKING = 10;

/** Number of results shown as the form of a player. */
export const FORM_LENGTH = 5;

/** One played match with the names normalised for lookups. */
interface Game {
  date: string;
  eveningName: string;
  homeKey: string;
  awayKey: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
}

export interface FormEntry {
  result: GameResult;
  date: string;
  eveningName: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
}

export interface PlayerRecord {
  key: string;
  /** Spelling used on the most recent evening. */
  name: string;
  evenings: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  /** Win 2, draw 1, loss 0. */
  points: number;
  /** Points per game, 0 to 2 (same scale as in the league tables). */
  avgPoints: number;
  /** Share of won games, 0 to 1. */
  winRate: number;
  /** Evenings won (final winner of a playoff, otherwise first place of the table). */
  titles: number;
  /** All results, oldest first. */
  form: FormEntry[];
}

export interface Overview {
  evenings: number;
  games: number;
  players: number;
  goals: number;
  goalsPerGame: number;
}

export interface Meeting {
  date: string;
  eveningName: string;
  goalsA: number;
  goalsB: number;
  /** Result from the view of player A. */
  result: GameResult;
}

export interface HeadToHead {
  games: number;
  winsA: number;
  draws: number;
  winsB: number;
  goalsA: number;
  goalsB: number;
  /** Newest first. */
  meetings: Meeting[];
}

export function playerKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

const eveningYear = (session: TrainingSession) => new Date(session.date).getFullYear();

/** "08.05.2026", the same format as in the history. */
export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const eveningLabel = (session: TrainingSession) =>
  session.name || `Trainingsabend ${formatShortDate(session.date)}`;

const isRealPlayer = (player: { id: string; name: string } | undefined | null) =>
  Boolean(player?.name) && !player!.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) && player!.name !== '–';

/** Played matches of an evening (group stage and playoff) in the order they were played. Byes are no games. */
function gamesOf(session: TrainingSession): Game[] {
  return sortMatches(session.matches)
    .filter(
      m =>
        m.isCompleted &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        !m.isBye &&
        isRealPlayer(m.homePlayer) &&
        isRealPlayer(m.awayPlayer),
    )
    .map(m => ({
      date: session.date,
      eveningName: eveningLabel(session),
      homeKey: playerKey(m.homePlayer.name),
      awayKey: playerKey(m.awayPlayer.name),
      homeName: m.homePlayer.name.trim(),
      awayName: m.awayPlayer.name.trim(),
      homeScore: m.homeScore as number,
      awayScore: m.awayScore as number,
    }));
}

/** Winner of an evening, same rule as in the history: playoff champion, otherwise first place. */
export function eveningWinner(session: TrainingSession): string | undefined {
  const groupMatches = getSwissMatches(session.matches);
  const playoffMatches = toPlayoffMatches(session.matches);

  const champion = playoffMatches.length > 0 ? getPlayoffFinalists(playoffMatches).champion : null;
  if (champion) return champion.name;

  if (!groupMatches.some(m => m.isCompleted)) return undefined;
  return calculatePlayerStats(session.players, groupMatches)[0]?.player.name;
}

/** Evenings that count: at least one played match, optionally limited to one year, oldest first. */
function relevantEvenings(sessions: TrainingSession[], year?: number): TrainingSession[] {
  return sessions
    .filter(s => (year === undefined || eveningYear(s) === year) && gamesOf(s).length > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Years that have at least one evening, newest first. */
export function availableYears(sessions: TrainingSession[]): number[] {
  const years = new Set(sessions.filter(s => gamesOf(s).length > 0).map(eveningYear));
  return [...years].sort((a, b) => b - a);
}

const resultOf = (own: number, other: number): GameResult => (own > other ? 'W' : own < other ? 'L' : 'D');

/** One record per player over the given evenings. */
export function buildRecords(sessions: TrainingSession[], year?: number): PlayerRecord[] {
  const records = new Map<string, PlayerRecord>();

  const recordFor = (key: string, name: string): PlayerRecord => {
    let record = records.get(key);
    if (!record) {
      record = {
        key, name, evenings: 0, games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
        goalDifference: 0, points: 0, avgPoints: 0, winRate: 0, titles: 0, form: [],
      };
      records.set(key, record);
    }
    record.name = name; // evenings are processed oldest first, so the latest spelling wins
    return record;
  };

  for (const session of relevantEvenings(sessions, year)) {
    const games = gamesOf(session);

    // Everyone listed on the evening took part, plus anyone who has a played match
    const present = new Map<string, string>();
    session.players.forEach(p => present.set(playerKey(p.name), p.name.trim()));
    games.forEach(g => {
      present.set(g.homeKey, g.homeName);
      present.set(g.awayKey, g.awayName);
    });
    present.forEach((name, key) => {
      recordFor(key, name).evenings += 1;
    });

    for (const game of games) {
      const sides = [
        { key: game.homeKey, name: game.homeName, own: game.homeScore, other: game.awayScore, opponent: game.awayName },
        { key: game.awayKey, name: game.awayName, own: game.awayScore, other: game.homeScore, opponent: game.homeName },
      ];
      for (const side of sides) {
        const record = recordFor(side.key, side.name);
        const result = resultOf(side.own, side.other);
        record.games += 1;
        record.goalsFor += side.own;
        record.goalsAgainst += side.other;
        if (result === 'W') record.wins += 1;
        else if (result === 'D') record.draws += 1;
        else record.losses += 1;
        record.form.push({
          result,
          date: game.date,
          eveningName: game.eveningName,
          opponent: side.opponent,
          goalsFor: side.own,
          goalsAgainst: side.other,
        });
      }
    }

    const winner = eveningWinner(session);
    if (winner) {
      const record = records.get(playerKey(winner));
      if (record) record.titles += 1;
    }
  }

  return [...records.values()].map(r => ({
    ...r,
    goalDifference: r.goalsFor - r.goalsAgainst,
    points: r.wins * 2 + r.draws,
    avgPoints: r.games > 0 ? (r.wins * 2 + r.draws) / r.games : 0,
    winRate: r.games > 0 ? r.wins / r.games : 0,
  }));
}

export function buildOverview(sessions: TrainingSession[], year?: number): Overview {
  const evenings = relevantEvenings(sessions, year);
  const players = new Set<string>();
  let games = 0;
  let goals = 0;

  for (const session of evenings) {
    for (const game of gamesOf(session)) {
      games += 1;
      goals += game.homeScore + game.awayScore;
      players.add(game.homeKey);
      players.add(game.awayKey);
    }
  }
  return { evenings: evenings.length, games, players: players.size, goals, goalsPerGame: games > 0 ? goals / games : 0 };
}

/** All matches between two players, from the view of player A. */
export function headToHead(sessions: TrainingSession[], keyA: string, keyB: string, year?: number): HeadToHead {
  const result: HeadToHead = { games: 0, winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0, meetings: [] };
  if (keyA === keyB) return result;

  for (const session of relevantEvenings(sessions, year)) {
    for (const game of gamesOf(session)) {
      const aIsHome = game.homeKey === keyA && game.awayKey === keyB;
      const aIsAway = game.awayKey === keyA && game.homeKey === keyB;
      if (!aIsHome && !aIsAway) continue;

      const goalsA = aIsHome ? game.homeScore : game.awayScore;
      const goalsB = aIsHome ? game.awayScore : game.homeScore;
      const outcome = resultOf(goalsA, goalsB);

      result.games += 1;
      result.goalsA += goalsA;
      result.goalsB += goalsB;
      if (outcome === 'W') result.winsA += 1;
      else if (outcome === 'L') result.winsB += 1;
      else result.draws += 1;
      result.meetings.push({ date: game.date, eveningName: game.eveningName, goalsA, goalsB, result: outcome });
    }
  }
  result.meetings.reverse();
  return result;
}

// ─── Sorting ───────────────────────────────────────────────────────────────

export type SortKey = 'name' | 'evenings' | 'games' | 'winRate' | 'avgPoints' | 'goalDifference' | 'titles';
export type SortDirection = 'asc' | 'desc';

/** Rates only say something after enough games. */
const RATE_KEYS: SortKey[] = ['winRate', 'avgPoints'];

/**
 * Sorts the records. For the rates (win rate, average points) players with fewer than
 * MIN_GAMES_FOR_RANKING games always come last, so a single lucky game does not lead the table.
 */
export function sortRecords(records: PlayerRecord[], key: SortKey, direction: SortDirection): PlayerRecord[] {
  const factor = direction === 'asc' ? 1 : -1;
  const isRate = RATE_KEYS.includes(key);

  return [...records].sort((a, b) => {
    if (isRate) {
      const aQualified = a.games >= MIN_GAMES_FOR_RANKING;
      const bQualified = b.games >= MIN_GAMES_FOR_RANKING;
      if (aQualified !== bQualified) return aQualified ? -1 : 1;
    }
    const diff =
      key === 'name' ? a.name.localeCompare(b.name, 'de') : (a[key] as number) - (b[key] as number);
    if (diff !== 0) return diff * factor;
    // Ties: more games first, then by name
    return b.games - a.games || a.name.localeCompare(b.name, 'de');
  });
}
