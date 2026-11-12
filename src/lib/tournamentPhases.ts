import { Match, TrainingSession, Player } from '@/types';
import { PlayoffMatch } from '@/types/swiss';

/** Placeholder prefix used for empty (TBD) playoff slots when flattening a Swiss session */
export const PLAYOFF_PLACEHOLDER_PREFIX = 'null-';

export function isPlayoffMatch(m: Match): boolean {
  return m.phase === 'playoff';
}

/** Matches of the Swiss/regular phase ("Vorrunde") */
export function getSwissMatches(matches: Match[]): Match[] {
  return matches.filter(m => !isPlayoffMatch(m));
}

export function getPlayoffFlatMatches(matches: Match[]): Match[] {
  return matches.filter(isPlayoffMatch);
}

function toPlayer(p: Player): Player | null {
  if (!p || !p.id || p.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) || p.name === '–') return null;
  return p;
}

/** Rebuild bracket structure from flat, persisted playoff matches */
export function toPlayoffMatches(matches: Match[]): PlayoffMatch[] {
  return getPlayoffFlatMatches(matches)
    .map((m, idx) => ({
      id: m.id,
      round: m.playoffRound ?? 1,
      matchNumber: m.matchNumber ?? idx + 1,
      homePlayer: toPlayer(m.homePlayer),
      awayPlayer: toPlayer(m.awayPlayer),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      isCompleted: m.isCompleted,
      isBye: m.isBye ?? false,
      suddenDeath: m.suddenDeath ?? false,
    }))
    .sort((a, b) => b.round - a.round || a.matchNumber - b.matchNumber);
}

export function hasPlayoff(session: TrainingSession): boolean {
  return getPlayoffFlatMatches(session.matches).length > 0;
}

/**
 * Checks a result entered for a knock-out game (playoff, decider). A knock-out game has no draw (SO § 9 Abs. 1 and 2):
 * it goes on with sudden death until a goal falls, so a sudden-death game is won by exactly one goal.
 * Returns the message to show, or null when the result is fine.
 */
export function playoffResultError(homeScore: number, awayScore: number, suddenDeath: boolean): string | null {
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    return 'Bitte gültige Tore eintragen.';
  }
  if (homeScore === awayScore) {
    return 'Im K.-o.-Spiel gibt es kein Unentschieden. Bitte das Endergebnis inklusive Sudden-Death-Tor eintragen.';
  }
  if (suddenDeath && Math.abs(homeScore - awayScore) !== 1) {
    return 'Bei Sudden Death gewinnt der Sieger mit genau einem Tor Vorsprung.';
  }
  return null;
}

/** Winner of a single playoff match (null if not decided) */
export function playoffMatchWinner(m: PlayoffMatch): Player | null {
  if (m.isBye) return m.homePlayer ?? m.awayPlayer ?? null;
  if (!m.isCompleted || m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return m.homePlayer ?? null;
  if (m.awayScore > m.homeScore) return m.awayPlayer ?? null;
  return null;
}

/** Champion + runner-up derived from the playoff final, if available */
export function getPlayoffFinalists(matches: PlayoffMatch[]): {
  champion: Player | null;
  runnerUp: Player | null;
} {
  const final = matches.find(m => m.round === 1);
  if (!final) return { champion: null, runnerUp: null };
  const champion = playoffMatchWinner(final);
  const runnerUp = champion
    ? (champion.id === final.homePlayer?.id ? final.awayPlayer ?? null : final.homePlayer ?? null)
    : null;
  return { champion, runnerUp };
}