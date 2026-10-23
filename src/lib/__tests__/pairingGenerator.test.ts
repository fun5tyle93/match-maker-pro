import { describe, expect, it } from 'vitest';
import { generatePairings } from '@/lib/pairingGenerator';
import { Player } from '@/types';

const makePlayers = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Spieler ${i + 1}` }));

describe('generatePairings table numbers', () => {
  it('sets a table number on every match', () => {
    const { matches } = generatePairings(makePlayers(6), 1);
    expect(matches.length).toBeGreaterThan(0);
    matches.forEach(m => expect(m.tableNumber).toBeGreaterThanOrEqual(1));
  });

  it('uses each table at most once per round', () => {
    const { matches } = generatePairings(makePlayers(8), 3);
    const byRound = new Map<number, number[]>();
    matches.forEach(m => byRound.set(m.round, [...(byRound.get(m.round) ?? []), m.tableNumber!]));
    byRound.forEach(tables => expect(new Set(tables).size).toBe(tables.length));
  });

  it('spreads every player across all tables over a session', () => {
    const players = makePlayers(6);
    const { matches } = generatePairings(players, 20);
    const tables = Math.floor(players.length / 2);

    players.forEach(p => {
      const played = matches.filter(m => m.homePlayer.id === p.id || m.awayPlayer.id === p.id);
      for (let t = 1; t <= tables; t++) {
        const onTable = played.filter(m => m.tableNumber === t).length;
        // Ideal share is 1/tables; allow generous randomness margin
        expect(onTable / played.length).toBeGreaterThan(0.1);
      }
    });
  });
});
