import { describe, it, expect } from 'vitest';
import { generateSwissRoundMatches, generatePlayoff } from '@/lib/swissPairing';
import { Player } from '@/types';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
}

describe('Swiss pairing', () => {
  it('does not create rematches across rounds', () => {
    const players = makePlayers(6);
    // Round 1
    const { matches: r1 } = generateSwissRoundMatches(players, [], 1, 3);
    // mark matches as completed and add them to rounds array format expected by pairing
    const rounds = [
      { roundNumber: 1, phase: 'swiss', matches: r1.map(m => ({ ...m, homeScore: 2, awayScore: 1, isCompleted: true })), isCompleted: true },
    ];

    const { matches: r2 } = generateSwissRoundMatches(players, rounds as any, 2, 3);

    const pairsR1 = new Set(r1.map(m => [m.homePlayer.id, m.awayPlayer.id].sort().join('|')));
    const pairsR2 = r2.map(m => [m.homePlayer.id, m.awayPlayer.id].sort().join('|'));

    pairsR2.forEach(p => expect(pairsR1.has(p)).toBe(false));
  });

  it('gives the bye to a player who has not had one yet (byes are read from the rounds)', () => {
    const players = makePlayers(7);
    const { matches: r1, byePlayerId: firstBye } = generateSwissRoundMatches(players, [], 1, 5);
    expect(firstBye).toBeDefined();
    const rounds = [
      { roundNumber: 1, phase: 'swiss', byePlayerId: firstBye, matches: r1.map(m => ({ ...m, homeScore: 2, awayScore: 1, isCompleted: true })), isCompleted: true },
    ];
    const { byePlayerId } = generateSwissRoundMatches(players, rounds as never, 2, 5);
    expect(byePlayerId).toBeDefined();
    expect(byePlayerId).not.toEqual(firstBye);
  });
});

describe('Playoff seeding', () => {
  it('places seed #1 and #2 in different halves for 4-player bracket', () => {
    // create dummy stats order such that players are seeded 1..4
    const stats = [1,2,3,4].map(i => ({ player: { id: `p${i}`, name: `Player ${i}` } } as any));
    const matches = generatePlayoff(stats as any, 'standard' as any, 'sf' as any);
    // find first-round matches (round === log2(bracketSize))
    const firstRound = matches.filter(m => m.round === Math.log2(4));
    // ensure p1 and p2 are not in the same first-round match
    const p1Match = firstRound.find(m => m.homePlayer?.id === 'p1' || m.awayPlayer?.id === 'p1');
    const p2Match = firstRound.find(m => m.homePlayer?.id === 'p2' || m.awayPlayer?.id === 'p2');
    expect(p1Match).toBeDefined();
    expect(p2Match).toBeDefined();
    expect(p1Match?.matchNumber).not.toEqual(p2Match?.matchNumber);
  });
});
