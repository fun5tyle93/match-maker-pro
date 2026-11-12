import { describe, expect, it } from 'vitest';
import {
  BYE_ID,
  maxSwissRounds,
  PairingBudgetError,
  pairKey,
  pairRound,
  SwissPairingError,
} from '@/lib/swissPairingEngine';
import { generatePlayoff, generateRefereeRound, generateSwissRoundMatches, computeSwissStats } from '@/lib/swissPairing';
import { Match, Player } from '@/types';
import { SwissRound } from '@/types/swiss';

/** Small seeded generator so that every failure can be reproduced. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const makePlayers = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Spieler ${i + 1}` }));

function played(match: Match, rnd: () => number): Match {
  return { ...match, homeScore: Math.floor(rnd() * 6), awayScore: Math.floor(rnd() * 6), isCompleted: true };
}

interface Violation { round: number; message: string }

/**
 * Plays a whole tournament with random results and checks every rule after every round.
 * Returns the violations (empty = the rules hold) and the rounds that were played.
 */
function playTournament(n: number, totalRounds: number, seed: number, referee: boolean): { violations: Violation[]; rounds: SwissRound[] } {
  const rnd = mulberry32(seed);
  const players = makePlayers(n);
  const ids = players.map(p => p.id);
  const rounds: SwissRound[] = [];
  const violations: Violation[] = [];
  const seenPairs = new Set<string>();
  const byes = new Set<string>();
  const fail = (round: number, message: string) => violations.push({ round, message });

  for (let r = 1; r <= totalRounds; r++) {
    let produced: SwissRound[];
    let byePlayerId: string | undefined;
    try {
      if (referee) {
        const result = generateRefereeRound(players, rounds, r, totalRounds, rnd);
        produced = [result.pass1, result.pass2];
        byePlayerId = result.byePlayerId;
      } else {
        const result = generateSwissRoundMatches(players, rounds, r, totalRounds, rnd);
        produced = [{ roundNumber: r, phase: 'swiss', matches: result.matches, isCompleted: false, byePlayerId: result.byePlayerId }];
        byePlayerId = result.byePlayerId;
      }
    } catch (error) {
      fail(r, `threw ${(error as Error).name}: ${(error as Error).message}`);
      return { violations, rounds };
    }

    const roundMatches = produced.flatMap(p => p.matches);
    const appearing = roundMatches.flatMap(m => [m.homePlayer.id, m.awayPlayer.id]);

    // R3: everybody plays exactly once, or has the bye
    const expected = n - (byePlayerId ? 1 : 0);
    if (new Set(appearing).size !== appearing.length) fail(r, 'a player plays twice in one round');
    if (appearing.length !== expected) fail(r, `${appearing.length} players play, expected ${expected}`);
    if ((n % 2 === 1) !== !!byePlayerId) fail(r, `bye ${byePlayerId} with ${n} players`);
    if (byePlayerId && appearing.includes(byePlayerId)) fail(r, 'the bye player also plays');
    if (appearing.some(id => !ids.includes(id))) fail(r, 'unknown player');

    // R1: no rematch; R2: at most one bye per player
    roundMatches.forEach(m => {
      const key = pairKey(m.homePlayer.id, m.awayPlayer.id);
      if (seenPairs.has(key)) fail(r, `rematch ${key}`);
      seenPairs.add(key);
    });
    if (byePlayerId) {
      if (byes.has(byePlayerId)) fail(r, `second bye for ${byePlayerId}`);
      byes.add(byePlayerId);
    }

    if (referee) {
      const [pass1, pass2] = produced;
      const in1 = new Set(pass1.matches.flatMap(m => [m.homePlayer.id, m.awayPlayer.id]));
      const in2 = new Set(pass2.matches.flatMap(m => [m.homePlayer.id, m.awayPlayer.id]));
      if ([...in1].some(id => in2.has(id))) fail(r, 'a player plays in both passes');
      if (Math.abs(pass1.matches.length - pass2.matches.length) > 1) fail(r, 'passes differ by more than one match');
      // The referees of a pass are the players of the other pass plus the player with the bye
      const expectedRefs1 = [...in2, ...(byePlayerId ? [byePlayerId] : [])].sort();
      const expectedRefs2 = [...in1, ...(byePlayerId ? [byePlayerId] : [])].sort();
      if (JSON.stringify([...(pass1.referees ?? [])].sort()) !== JSON.stringify(expectedRefs1)) fail(r, 'referees of pass 1 are wrong');
      if (JSON.stringify([...(pass2.referees ?? [])].sort()) !== JSON.stringify(expectedRefs2)) fail(r, 'referees of pass 2 are wrong');
      if ((pass1.referees ?? []).some(id => in1.has(id))) fail(r, 'a player referees his own pass');
      if ((pass2.referees ?? []).some(id => in2.has(id))) fail(r, 'a player referees his own pass');
    }

    produced.forEach(p => rounds.push({ ...p, matches: p.matches.map(m => played(m, rnd)), isCompleted: true }));
  }
  return { violations, rounds };
}

describe('maxSwissRounds', () => {
  it('is n - 1 for an even and n for an odd number of players', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17].map(maxSwissRounds)).toEqual([0, 0, 1, 3, 3, 5, 5, 7, 7, 9, 15, 17]);
  });
});

describe('pairKey', () => {
  it('does not depend on the order', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
    expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'));
  });
});

describe('pairRound (single round)', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('R4: the best player meets the next-ranked one, and so on', () => {
    expect(pairRound({ ranking: names, played: new Set(), roundsAfter: 0 })).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']]);
  });

  it('R4: when the nearest opponent was met already, the next one is taken', () => {
    const result = pairRound({ ranking: names, played: new Set([pairKey('a', 'b')]), roundsAfter: 0 })!;
    expect(result[0]).toEqual(['a', 'c']);
    expect(result.map(p => pairKey(p[0], p[1])).sort()).toEqual(['a|c', 'b|d', 'e|f']);
  });

  it('R5: the bye goes to the last-ranked player', () => {
    const result = pairRound({ ranking: ['p1', 'p2', 'p3', 'p4', 'p5'], played: new Set(), roundsAfter: 0 })!;
    expect(result).toContainEqual(['p5', BYE_ID]);
  });

  it('R5/R2: a player who had the bye does not get it again; the next-lowest does', () => {
    const result = pairRound({ ranking: ['p1', 'p2', 'p3', 'p4', 'p5'], played: new Set([pairKey('p5', BYE_ID)]), roundsAfter: 0 })!;
    const byeHolder = result.find(p => p.includes(BYE_ID))!.find(id => id !== BYE_ID);
    expect(byeHolder).toBe('p4');
  });

  it('R9: returns null when only rematches are left, and never a rematch', () => {
    const allPairs = new Set<string>();
    ['a', 'b', 'c', 'd'].forEach((x, i, arr) => arr.slice(i + 1).forEach(y => allPairs.add(pairKey(x, y))));
    expect(pairRound({ ranking: ['a', 'b', 'c', 'd'], played: allPairs, roundsAfter: 0 })).toBeNull();
  });

  it('R6: a round that would leave the next round undrawable is not taken', () => {
    // Four players, rounds 1 and 2 give a-b, c-d and a-c, b-d. Round 3 must then be a-d, b-c.
    const played2 = new Set([pairKey('a', 'b'), pairKey('c', 'd'), pairKey('a', 'c'), pairKey('b', 'd')]);
    expect(pairRound({ ranking: ['a', 'b', 'c', 'd'], played: played2, roundsAfter: 0 })).toEqual([['a', 'd'], ['b', 'c']]);
    // After round 1 only (a-b, c-d): a greedy a-c, b-d is fine, but a-d, b-c as round 2 is also fine; both keep round 3 possible
    const after1 = pairRound({ ranking: ['a', 'b', 'c', 'd'], played: new Set([pairKey('a', 'b'), pairKey('c', 'd')]), roundsAfter: 1 })!;
    expect(after1).toHaveLength(2);
  });

  it('R6: five rounds for four players cannot be planned, so the first round is not drawable with that lookahead', () => {
    // Round 1 with four more rounds after it: impossible, because only three rounds exist for four players
    expect(pairRound({ ranking: ['a', 'b', 'c', 'd'], played: new Set(), roundsAfter: 4 })).toBeNull();
    expect(pairRound({ ranking: ['a', 'b', 'c', 'd'], played: new Set(), roundsAfter: 2 })).not.toBeNull();
  });

  it('uses the search budget as a protection against endless searching', () => {
    expect(() => pairRound({ ranking: makeIds(20), played: new Set(), roundsAfter: 15, budget: 50 })).toThrow(PairingBudgetError);
  });

  it('handles two players, one player and nobody', () => {
    expect(pairRound({ ranking: ['a', 'b'], played: new Set(), roundsAfter: 0 })).toEqual([['a', 'b']]);
    expect(pairRound({ ranking: ['a'], played: new Set(), roundsAfter: 0 })).toEqual([['a', BYE_ID]]);
    expect(pairRound({ ranking: [], played: new Set(), roundsAfter: 0 })).toEqual([]);
  });
});

function makeIds(n: number) { return Array.from({ length: n }, (_, i) => `p${i + 1}`); }

describe('whole tournaments (random results): the rules hold in every round', () => {
  // For every size: one round, two rounds, about half, and the most that is possible (at most 10, the limit of the app)
  const roundCounts = (n: number) => [...new Set([1, 2, Math.ceil(n / 2), Math.min(10, maxSwissRounds(n))])].filter(r => r >= 1 && r <= maxSwissRounds(n));

  for (let n = 4; n <= 16; n++) {
    for (const rounds of roundCounts(n)) {
      const tournaments = n <= 10 ? 200 : 40;
      it(`${n} players, ${rounds} rounds (${tournaments} tournaments): no rematch, at most one bye, complete rounds, never stuck`, () => {
        for (let t = 0; t < tournaments; t++) {
          const { violations } = playTournament(n, rounds, 1000 * n + 10 * rounds + t, false);
          expect(violations, `n=${n} rounds=${rounds} seed=${1000 * n + 10 * rounds + t}`).toEqual([]);
        }
      });
    }
  }

  for (const n of [20, 24]) {
    for (const rounds of [5, 10]) {
      it(`${n} players, ${rounds} rounds: draws within the budget and keeps all rules`, () => {
        for (let t = 0; t < 3; t++) {
          const { violations } = playTournament(n, rounds, 77 + t, false);
          expect(violations, `n=${n} rounds=${rounds}`).toEqual([]);
        }
      }, 120000);
    }
  }
});

describe('referee mode (two passes per round)', () => {
  for (let n = 4; n <= 14; n++) {
    const rounds = Math.min(10, maxSwissRounds(n));
    const tournaments = n <= 9 ? 100 : 25;
    it(`${n} players, ${rounds} rounds (${tournaments} tournaments): nobody plays in both passes, referees are the other pass plus the bye`, () => {
      for (let t = 0; t < tournaments; t++) {
        const { violations } = playTournament(n, rounds, 5000 + 100 * n + t, true);
        expect(violations, `n=${n} seed=${5000 + 100 * n + t}`).toEqual([]);
      }
    });
  }

  it('the player with the bye is a referee in both passes and plays in none', () => {
    const players = makePlayers(7);
    const { pass1, pass2, byePlayerId } = generateRefereeRound(players, [], 1, 3, mulberry32(3));
    expect(byePlayerId).toBeDefined();
    expect(pass1.referees).toContain(byePlayerId);
    expect(pass2.referees).toContain(byePlayerId);
    expect(pass1.byePlayerId).toBe(byePlayerId);
    const playing = [...pass1.matches, ...pass2.matches].flatMap(m => [m.homePlayer.id, m.awayPlayer.id]);
    expect(playing).not.toContain(byePlayerId);
    expect(playing).toHaveLength(6);
  });

  it('six players (which used to fail in round 1) are drawn: passes of 2 and 1 matches', () => {
    const { pass1, pass2 } = generateRefereeRound(makePlayers(6), [], 1, 3, mulberry32(11));
    expect([pass1.matches.length, pass2.matches.length]).toEqual([2, 1]);
    expect(pass1.referees).toHaveLength(2);
    expect(pass2.referees).toHaveLength(4);
  });
});

describe('integration rules', () => {
  it('is reproducible with the same random source', () => {
    const players = makePlayers(8);
    const a = generateSwissRoundMatches(players, [], 1, 4, mulberry32(42)).matches.map(m => [m.homePlayer.id, m.awayPlayer.id]);
    const b = generateSwissRoundMatches(players, [], 1, 4, mulberry32(42)).matches.map(m => [m.homePlayer.id, m.awayPlayer.id]);
    expect(a).toEqual(b);
  });

  it('more rounds than players can meet: the tournament is shortened, and a round beyond the possible one throws', () => {
    const players = makePlayers(4);
    const rounds: SwissRound[] = [];
    const rnd = mulberry32(5);
    for (let r = 1; r <= 3; r++) {
      const { matches } = generateSwissRoundMatches(players, rounds, r, 5, rnd);   // 5 rounds asked, 3 possible
      rounds.push({ roundNumber: r, phase: 'swiss', matches: matches.map(m => played(m, rnd)), isCompleted: true });
    }
    expect(() => generateSwissRoundMatches(players, rounds, 4, 5, rnd)).toThrow(SwissPairingError);
  });

  it('the error message tells what to do', () => {
    const players = makePlayers(4);
    const rnd = mulberry32(9);
    const rounds: SwissRound[] = [];
    for (let r = 1; r <= 3; r++) {
      const { matches } = generateSwissRoundMatches(players, rounds, r, 3, rnd);
      rounds.push({ roundNumber: r, phase: 'swiss', matches: matches.map(m => played(m, rnd)), isCompleted: true });
    }
    expect(() => generateSwissRoundMatches(players, rounds, 4, 3, rnd)).toThrow(/Rundenzahl/);
  });

  it('later rounds follow the standings: the leaders meet before the others', () => {
    // After round 1 of 8 players the winners (2 points) are ranked above the losers; with a fixed random source
    // the best group is paired among itself where that is allowed.
    const players = makePlayers(8);
    const rnd = mulberry32(21);
    const first = generateSwissRoundMatches(players, [], 1, 3, rnd).matches.map(m => ({ ...m, homeScore: 1, awayScore: 0, isCompleted: true }));
    const rounds: SwissRound[] = [{ roundNumber: 1, phase: 'swiss', matches: first, isCompleted: true }];
    const winners = new Set(first.map(m => m.homePlayer.id));
    const second = generateSwissRoundMatches(players, rounds, 2, 3, rnd).matches;
    const winnerPairs = second.filter(m => winners.has(m.homePlayer.id) && winners.has(m.awayPlayer.id));
    expect(winnerPairs.length).toBeGreaterThanOrEqual(1);
    const standings = computeSwissStats(players, rounds);
    expect(standings.slice(0, 4).every(s => winners.has(s.player.id))).toBe(true);
  });
});

describe('playoff: rematches from the group phase are allowed', () => {
  it('two players who met in the group phase can meet again in the semi-final', () => {
    const players = makePlayers(4);
    // Group phase: p1 beat p4 in round 1
    const stats = computeSwissStats(players, [{
      roundNumber: 1, phase: 'swiss', isCompleted: true,
      matches: [
        { id: 'a', round: 1, homePlayer: players[0], awayPlayer: players[3], homeScore: 2, awayScore: 0, isCompleted: true },
        { id: 'b', round: 1, homePlayer: players[1], awayPlayer: players[2], homeScore: 1, awayScore: 0, isCompleted: true },
      ],
    }]);
    const bracket = generatePlayoff(stats, 'standard', 'sf');
    const semis = bracket.filter(m => m.round === 2);
    const pairs = semis.map(m => pairKey(m.homePlayer!.id, m.awayPlayer!.id));
    expect(pairs).toHaveLength(2);
    // 1 v 4 and 2 v 3 by the ranking: p1 and p4 meet again
    expect(pairs).toContain(pairKey('p1', 'p4'));
  });
});
