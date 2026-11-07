import { describe, expect, it } from 'vitest';
import { pausingPlayers } from '@/lib/tables';
import { generatePairings } from '@/lib/pairingGenerator';
import { Match, Player } from '@/types';

const names = ['Anna', 'Bernd', 'Clara', 'Dirk', 'Eva', 'Frank', 'Gerd'];
const makePlayers = (n: number): Player[] => names.slice(0, n).map((name, i) => ({ id: `p${i}`, name }));

describe('pausingPlayers', () => {
  it('is empty when every player plays (even number)', () => {
    const players = makePlayers(6);
    const { matches } = generatePairings(players, 1);
    const rounds = new Set(matches.map(m => m.round));
    rounds.forEach(round => {
      expect(pausingPlayers(players, matches.filter(m => m.round === round))).toEqual([]);
    });
  });

  it.each([3, 5, 7])('exactly one player pauses per round with %i players, and everybody pauses once', count => {
    const players = makePlayers(count);
    const { matches } = generatePairings(players, 1);
    const paused: string[] = [];
    new Set(matches.map(m => m.round)).forEach(round => {
      const roundMatches = matches.filter(m => m.round === round);
      const pausing = pausingPlayers(players, roundMatches);
      expect(pausing).toHaveLength(1);
      // Independent check: the pausing player appears in none of the round's matches
      const appearing = roundMatches.flatMap((m: Match) => [m.homePlayer.name, m.awayPlayer.name]);
      expect(appearing).not.toContain(pausing[0].name);
      expect(appearing).toHaveLength(count - 1);
      paused.push(pausing[0].name);
    });
    expect(new Set(paused).size).toBe(count);
  });

  it('works with several repetitions (a player may pause again in a later round)', () => {
    const players = makePlayers(5);
    const { matches } = generatePairings(players, 2);
    new Set(matches.map(m => m.round)).forEach(round => {
      expect(pausingPlayers(players, matches.filter(m => m.round === round))).toHaveLength(1);
    });
  });

  it('returns nobody for a round without matches data only if no players are given', () => {
    expect(pausingPlayers([], [])).toEqual([]);
  });
});
