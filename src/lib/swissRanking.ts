import { Match, TrainingSession } from '@/types';
import { SwissRound } from '@/types/swiss';
import { computeStats, FinalRow, finalRankingSwiss, Ranked, rankPlayers } from './ranking';
import { computeSwissStats } from './swissPairing';
import { getSwissMatches, getPlayoffFlatMatches } from './tournamentPhases';

/** The rounds of a Swiss tournament rebuilt from the flat list of saved matches. */
function roundsOf(matches: Match[]): SwissRound[] {
  const numbers = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  return numbers.map(n => ({
    roundNumber: n,
    phase: 'swiss' as const,
    matches: matches.filter(m => m.round === n),
    isCompleted: true,
  }));
}

/**
 * Ranking of the group phase of a saved evening, under the rule the evening was played under.
 * Training evenings: 'legacy' or DTKV (src/lib/ranking.ts). Swiss tournaments: the Swiss standings
 * (points per game, Buchholz, ...), see computeSwissStats.
 */
export function rankSession(session: TrainingSession): Ranked {
  const groupMatches = getSwissMatches(session.matches);
  if (session.tournamentType === 'swiss') {
    const byId = new Map(computeStats(session.players, groupMatches).map(s => [s.player.id, s]));
    const stats = computeSwissStats(session.players, roundsOf(groupMatches))
      .map(s => byId.get(s.player.id))
      .filter((s): s is NonNullable<typeof s> => !!s);
    return { stats, places: stats.map((_, i) => i + 1) };
  }
  return rankPlayers(session.players, groupMatches, session.rankingRule ?? 'legacy', session.deciderResults ?? []);
}

/**
 * Final ranking of a Swiss tournament with a playoff (Spielordnung 2026 § 9 Absatz 6), from a saved evening.
 * null when the evening is not a Swiss tournament or has no playoff.
 */
export function sessionFinalRanking(session: TrainingSession): FinalRow[] | null {
  if (session.tournamentType !== 'swiss') return null;
  const playoff = getPlayoffFlatMatches(session.matches);
  if (playoff.length === 0) return null;
  const order = rankSession(session).stats.map(s => s.player.id);
  return finalRankingSwiss(session.players, getSwissMatches(session.matches), playoff, order);
}
