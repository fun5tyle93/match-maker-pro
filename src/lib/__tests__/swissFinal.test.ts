import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { finalSwissResult } from '@/lib/swissFinal';
import { PLAYOFF_PLACEHOLDER_PREFIX } from '@/lib/tournamentPhases';
import { Match } from '@/types';
import * as f from './swissFixtures';

const who = f.swissPlayer;
const group = [
  f.game(who, 'A', 'B', 3, 0, 1), f.game(who, 'C', 'D', 1, 0, 1),
  f.game(who, 'A', 'C', 2, 0, 2), f.game(who, 'B', 'D', 1, 0, 2),
  f.game(who, 'A', 'D', 2, 1, 3), f.game(who, 'B', 'C', 0, 0, 3),
];
const players = ['A', 'B', 'C', 'D'].map(who);
const playoff = (over: Partial<Match>): Match => ({
  id: 'p1', round: 4, homePlayer: who('A'), awayPlayer: who('B'), homeScore: 5, awayScore: 0, isCompleted: true,
  phase: 'playoff', playoffRound: 1, matchNumber: 1, isBye: false, ...over,
});
const placeholder = { id: `${PLAYOFF_PLACEHOLDER_PREFIX}a-p1`, name: '–' };
const rowOf = (r: ReturnType<typeof finalSwissResult>, id: string) => r.stats.find(s => s.player.id === id)!;

describe('finalSwissResult', () => {
  it('adds a played playoff game to both players', () => {
    const r = finalSwissResult(players, group, [playoff({})]);
    expect(rowOf(r, 'A')).toMatchObject({ wins: 4, goalsFor: 12, points: 8 });
    expect(rowOf(r, 'B')).toMatchObject({ losses: 2, goalsAgainst: 8, points: 3 });
  });

  it('ignores a game with an empty place (placeholder), even when it has a result', () => {
    const before = finalSwissResult(players, group, []);
    const r = finalSwissResult(players, group, [playoff({ awayPlayer: placeholder })]);
    expect(rowOf(r, 'A')).toEqual(rowOf(before, 'A'));
  });

  it('ignores byes and games that are not finished', () => {
    const before = finalSwissResult(players, group, []);
    const r = finalSwissResult(players, group, [playoff({ isBye: true }), playoff({ id: 'p2', isCompleted: false, homeScore: null, awayScore: null })]);
    expect(rowOf(r, 'A')).toEqual(rowOf(before, 'A'));
    expect(rowOf(r, 'B')).toEqual(rowOf(before, 'B'));
  });
});
