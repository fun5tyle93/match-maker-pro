import { Match } from '@/types';

// Matches without a stored table number sort after those with one and keep their order
const tableKey = (m: Match) => m.tableNumber ?? Number.MAX_SAFE_INTEGER;

/** Sorts matches by round, then by table. */
export function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => a.round - b.round || tableKey(a) - tableKey(b));
}

/** Groups matches by round; within a round they are ordered by table. */
export function groupMatchesByRound(matches: Match[]): Record<number, Match[]> {
  return sortMatches(matches).reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);
}
