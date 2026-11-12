import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS reference implementation of the same rules (no type declarations)
import { rankGroup, finalRankingSwiss as referenceFinalRanking } from '../../../scripts/dtkv-ranking-reference.mjs';
import {
  compareEternalRows,
  compareLeagueRows,
  computeStats,
  finalRankingFromTotals,
  finalRankingSwiss,
  isOutOfCompetition,
  leagueTitleHolders,
  pendingDeciders,
  placesFor,
  rankBlocksDtkv,
  rankPlayers,
  sortRows,
  winnerAndRunnerUp,
} from '@/lib/ranking';
import { calculatePlayerStats } from '@/lib/pairingGenerator';
import { Match, Player, PlayerStats } from '@/types';

const player = (id: string): Player => ({ id, name: id });
const players = (ids: string[]) => ids.map(player);

let counter = 0;
const game = (home: string, away: string, hs: number, as: number, extra: Partial<Match> = {}): Match => ({
  id: `m${++counter}`,
  round: 1,
  homePlayer: player(home),
  awayPlayer: player(away),
  homeScore: hs,
  awayScore: as,
  isCompleted: true,
  ...extra,
});
const games = (list: [string, string, number, number][]) => list.map(([h, a, hs, as]) => game(h, a, hs, as));

/** Blocks as sorted id lists, to compare ties without depending on the order inside a tie. */
const normalize = (blocks: string[][]) => blocks.map(b => [...b].sort());
const show = (blocks: string[][]) => blocks.map(b => [...b].sort().join('=')).join(' > ');

/** Small seeded generator so that failures are reproducible. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = <T,>(list: T[], rnd: () => number) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function randomEvening(n: number, rnd: () => number, maxGoals: number) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const ms: Match[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const home = rnd() < 0.5;
    ms.push(game(home ? ids[i] : ids[j], home ? ids[j] : ids[i], Math.floor(rnd() * (maxGoals + 1)), Math.floor(rnd() * (maxGoals + 1))));
  }
  return { ids, ms };
}

describe('DTKV tie-break (Spielordnung 2026 § 8 Absatz 3)', () => {
  const cases: { name: string; ids: string[]; ms: [string, string, number, number][]; expect: string }[] = [
    { name: '1 direct comparison beats goal difference', ids: ['A', 'B', 'C', 'D'],
      ms: [['A', 'B', 1, 0], ['C', 'A', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 9, 0], ['B', 'D', 9, 0], ['D', 'C', 1, 0]], expect: 'A > B > D > C' },
    { name: '2 direct comparison level: goal difference of the whole group', ids: ['A', 'B', 'C'],
      ms: [['A', 'B', 2, 2], ['A', 'C', 3, 0], ['B', 'C', 1, 0]], expect: 'A > B > C' },
    { name: '3 three in a circle', ids: ['A', 'B', 'C', 'D'],
      ms: [['A', 'B', 1, 0], ['B', 'C', 1, 0], ['C', 'A', 1, 0], ['A', 'D', 5, 0], ['B', 'D', 3, 0], ['C', 'D', 1, 0]], expect: 'A > B > C > D' },
    { name: '4 two level pairs, direct comparison each', ids: ['A', 'B', 'C', 'D'],
      ms: [['A', 'B', 3, 0], ['A', 'C', 3, 0], ['B', 'C', 0, 1], ['D', 'A', 1, 0], ['B', 'D', 1, 0], ['C', 'D', 1, 0]], expect: 'A > C > B > D' },
    { name: '5 complete tie stays a tie', ids: ['A', 'B'], ms: [['A', 'B', 2, 2]], expect: 'A=B' },
    { name: '6 goals of the sub-group before the whole group', ids: ['A', 'B', 'C', 'D', 'E'],
      ms: [['A', 'B', 1, 0], ['A', 'C', 5, 0], ['B', 'C', 0, 0], ['D', 'A', 1, 0], ['E', 'A', 1, 0], ['B', 'D', 1, 0], ['B', 'E', 1, 1], ['C', 'D', 9, 0], ['C', 'E', 0, 0], ['D', 'E', 0, 0]],
      expect: 'E > A > B > C > D' },
  ];

  it.each(cases)('$name', c => {
    expect(show(rankBlocksDtkv(c.ids, games(c.ms)))).toBe(c.expect);
  });

  it('the old ranking gets cases 1, 4 and 6 wrong (the reason for the new rule)', () => {
    const order = (c: typeof cases[number]) => calculatePlayerStats(players(c.ids), games(c.ms)).map(s => s.player.id).join(' > ');
    expect(order(cases[0])).toBe('B > A > D > C');
    expect(order(cases[3])).toBe('A > C > D > B');
    expect(order(cases[5])).toBe('E > C > A > B > D');
  });

  it('agrees with the reference implementation on random evenings (many ties)', () => {
    const rnd = mulberry32(2026);
    for (let t = 0; t < 400; t++) {
      const n = 3 + Math.floor(rnd() * 6);
      const { ids, ms } = randomEvening(n, rnd, 2);
      const reference = rankGroup(ids, ms.map(m => ({ home: m.homePlayer.id, away: m.awayPlayer.id, hs: m.homeScore, as: m.awayScore })));
      expect(show(rankBlocksDtkv(ids, ms)), `evening ${t}`).toBe(show(reference));
    }
  });

  it('does not depend on the order of players and games', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 200; t++) {
      const { ids, ms } = randomEvening(3 + Math.floor(rnd() * 5), rnd, 2);
      const expected = normalize(rankBlocksDtkv(ids, ms));
      expect(normalize(rankBlocksDtkv(shuffled(ids, rnd), shuffled(ms, rnd))), `evening ${t}`).toEqual(expected);
    }
  });

  it('ignores games that are not completed', () => {
    const open = game('A', 'B', 0, 0, { isCompleted: false, homeScore: null, awayScore: null });
    expect(show(rankBlocksDtkv(['A', 'B', 'C'], [...games([['A', 'B', 1, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]]), open]))).toBe('A > B > C');
  });

  it('every player is placed exactly once', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 100; t++) {
      const { ids, ms } = randomEvening(3 + Math.floor(rnd() * 6), rnd, 2);
      const flat = rankBlocksDtkv(ids, ms).flat();
      expect([...flat].sort()).toEqual([...ids].sort());
    }
  });
});

describe('rankPlayers', () => {
  it("'legacy' keeps the old order and gives every player their own place", () => {
    const ids = ['A', 'B'];
    const ranked = rankPlayers(players(ids), games([['A', 'B', 2, 2]]), 'legacy');
    expect(ranked.places).toEqual([1, 2]);
  });

  it("'dtkv2026' gives players that are still level the same place (1, 1, 3)", () => {
    const ranked = rankPlayers(players(['A', 'B', 'C']), games([['A', 'B', 2, 2], ['A', 'C', 1, 0], ['B', 'C', 1, 0]]), 'dtkv2026');
    expect(ranked.stats.map(s => s.player.id).slice(0, 2).sort()).toEqual(['A', 'B']);
    expect(ranked.places).toEqual([1, 1, 3]);
  });

  it('applies the result of a decider and leaves the numbers of the evening untouched', () => {
    const ms = games([['A', 'B', 2, 2], ['A', 'C', 1, 0], ['B', 'C', 1, 0]]);
    const without = rankPlayers(players(['A', 'B', 'C']), ms, 'dtkv2026');
    const decided = rankPlayers(players(['A', 'B', 'C']), ms, 'dtkv2026', [{ players: ['A', 'B'], order: ['B', 'A'] }]);
    expect(decided.stats.map(s => s.player.id)).toEqual(['B', 'A', 'C']);
    expect(decided.places).toEqual([1, 2, 3]);
    const sum = (r: typeof without) => r.stats.map(s => `${s.player.id}:${s.points}:${s.goalsFor}:${s.goalsAgainst}`).sort();
    expect(sum(decided)).toEqual(sum(without));
  });

  it('a decider for other players is ignored', () => {
    const ms = games([['A', 'B', 2, 2]]);
    const ranked = rankPlayers(players(['A', 'B']), ms, 'dtkv2026', [{ players: ['X', 'Y'], order: ['Y', 'X'] }]);
    expect(ranked.places).toEqual([1, 1]);
  });

  it('reports ties that reach place 1 or 2 and names winner and runner-up only when the place is not shared', () => {
    const tiedFirst = rankPlayers(players(['A', 'B', 'C']), games([['A', 'B', 2, 2], ['A', 'C', 1, 0], ['B', 'C', 1, 0]]), 'dtkv2026');
    expect(pendingDeciders(tiedFirst)).toEqual([{ place: 1, players: expect.any(Array) }]);
    expect(winnerAndRunnerUp(tiedFirst)).toEqual({ winner: undefined, runnerUp: undefined });

    const clear = rankPlayers(players(['A', 'B', 'C']), games([['A', 'B', 3, 0], ['A', 'C', 3, 0], ['B', 'C', 1, 0]]), 'dtkv2026');
    expect(pendingDeciders(clear)).toEqual([]);
    expect(winnerAndRunnerUp(clear).winner?.id).toBe('A');
    expect(winnerAndRunnerUp(clear).runnerUp?.id).toBe('B');

    // a tie only at the back needs no decider (SO § 8 Abs. 3 Satz 15)
    const backTie = rankPlayers(players(['A', 'B', 'C', 'D']), games([['A', 'B', 3, 0], ['A', 'C', 3, 0], ['A', 'D', 3, 0], ['B', 'C', 2, 0], ['B', 'D', 2, 0], ['C', 'D', 1, 1]]), 'dtkv2026');
    expect(backTie.places).toEqual([1, 2, 3, 3]);
    expect(pendingDeciders(backTie)).toEqual([]);
    expect(winnerAndRunnerUp(backTie).runnerUp?.id).toBe('B');
  });

  it('a tie for second place needs a decider and gives no runner-up', () => {
    const r = rankPlayers(players(['A', 'B', 'C', 'D']), games([['A', 'B', 3, 0], ['A', 'C', 3, 0], ['A', 'D', 3, 0], ['B', 'C', 1, 1], ['B', 'D', 1, 1], ['C', 'D', 1, 1]]), 'dtkv2026');
    expect(r.places[0]).toBe(1);
    expect(r.places.slice(1)).toEqual([2, 2, 2]);
    expect(pendingDeciders(r)).toHaveLength(1);
    expect(winnerAndRunnerUp(r)).toMatchObject({ runnerUp: undefined });
  });

  it('does not count a player twice when the list contains the same id twice', () => {
    const list = [player('A'), player('B'), player('A')];
    const ranked = rankPlayers(list, games([['A', 'B', 1, 0]]), 'dtkv2026');
    expect(ranked.stats.map(s => s.player.id)).toEqual(['A', 'B']);
  });
});

describe('league tables', () => {
  const row = (id: string, points: number, pointsAgainst: number, goalsFor: number, goalsAgainst: number, championships = 0): PlayerStats => ({
    player: player(id), wins: 0, draws: 0, losses: 0, goalsFor, goalsAgainst, points, pointsAgainst,
    goalDifference: goalsFor - goalsAgainst, championships, viceChampionships: 0,
  });

  it('SO § 2 Absatz 6: points, then fewer points lost, then goal difference, then goals scored', () => {
    const rows = [row('d', 10, 4, 20, 10), row('c', 10, 2, 5, 5), row('b', 10, 2, 15, 5), row('a', 12, 9, 1, 1)];
    expect(sortRows(rows, false).map(r => r.player.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(compareLeagueRows(row('x', 10, 2, 9, 4), row('y', 10, 2, 9, 4))).toBe(0);
    // goals scored decide only when the goal difference is level
    expect(sortRows([row('p', 10, 2, 8, 3), row('q', 10, 2, 12, 7)], false).map(r => r.player.id)).toEqual(['q', 'p']);
  });

  it('fewer points lost wins even against a better goal difference', () => {
    expect(sortRows([row('many', 10, 6, 50, 0), row('few', 10, 2, 1, 1)], false).map(r => r.player.id)).toEqual(['few', 'many']);
  });

  it('eternal table: points, then championships; level rows share a place', () => {
    const rows = [row('a', 10, 0, 0, 0, 1), row('b', 10, 0, 0, 0, 3), row('c', 10, 0, 0, 0, 3), row('d', 5, 0, 0, 0, 9)];
    const sorted = sortRows(rows, true);
    expect(sorted.map(r => r.player.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(placesFor(sorted, true)).toEqual([1, 1, 3, 4]);
    expect(compareEternalRows(rows[1], rows[2])).toBe(0);
  });

  it('the order does not depend on the order the rows came in (only level rows keep theirs)', () => {
    const rnd = mulberry32(5);
    const rows = Array.from({ length: 20 }, (_, i) => row(`r${i}`, Math.floor(rnd() * 5), Math.floor(rnd() * 3), Math.floor(rnd() * 4), Math.floor(rnd() * 4)));
    const key = (r: PlayerStats) => `${r.points}|${r.pointsAgainst}|${r.goalDifference}|${r.goalsFor}`;
    expect(sortRows(shuffled(rows, rnd), false).map(key)).toEqual(sortRows(rows, false).map(key));
  });
});

describe('final ranking of a Swiss tournament (Spielordnung 2026 § 9 Absatz 6)', () => {
  // The worked example of docs/UMSETZUNGSPLAN.md 6.8 (case 7 of the reference script)
  const P = (n: number) => `P${n}`;
  const everyone = Array.from({ length: 12 }, (_, i) => player(P(i + 1)));
  const swissOrder = everyone.map(p => p.id);
  const totals = (list: [number, number, number][]) =>
    new Map(list.map(([n, points, goalDifference]) => [P(n), { points, goalDifference }]));
  const swissTotals = totals([
    [1, 10, 12], [2, 9, 8], [3, 9, 5], [4, 8, 6], [5, 8, 3], [6, 7, 2],
    [7, 7, 1], [8, 7, -2], [9, 5, 0], [10, 4, -3], [11, 3, -6], [12, 2, -9],
  ]);
  const po = (round: number, home: number, away: number, hs: number, as: number, suddenDeath = false): Match =>
    game(P(home), P(away), hs, as, { phase: 'playoff', playoffRound: round, suddenDeath });
  const playoff: Match[] = [
    po(3, 1, 8, 2, 1), po(3, 4, 5, 2, 3, true), po(3, 2, 7, 4, 0), po(3, 3, 6, 1, 2),
    po(2, 1, 5, 1, 2), po(2, 2, 6, 2, 1, true),
    po(1, 5, 2, 0, 3),
  ];
  const ids = (rows: { player: Player }[]) => rows.map(r => r.player.id).join(' ');

  it('worked example: Swiss points plus playoff points, ordered by the round of elimination', () => {
    expect(ids(finalRankingFromTotals(everyone, swissTotals, playoff, swissOrder)))
      .toBe('P2 P5 P1 P6 P3 P4 P7 P8 P9 P10 P11 P12');
  });

  it('counts sudden-death games as 1.5 / 0.5 points and shows the playoff points', () => {
    const rows = finalRankingFromTotals(everyone, swissTotals, playoff, swissOrder);
    const row = (id: string) => rows.find(r => r.player.id === id)!;
    expect(row('P5').playoffPoints).toBe(1.5 + 2 + 0);   // QF won after sudden death, SF won, final lost
    expect(row('P6').playoffPoints).toBe(2 + 0.5);       // QF won, SF lost after sudden death
    expect(row('P4').playoffPoints).toBe(0.5);           // QF lost after sudden death
    expect(row('P2').points).toBe(9 + 2 + 1.5 + 2);      // Swiss 9 + QF 2 + SF after sudden death 1.5 + final 2
    expect(row('P9').playoffPoints).toBe(0);
    expect(rows.map(r => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('gives the halves of the Swiss points no weight on their own: playoff points alone would order it differently', () => {
    // with the Swiss phase left out, P6 (2.5 playoff points) would stand before P1 (2 points)
    const noSwiss = new Map(everyone.map(p => [p.id, { points: 0, goalDifference: 0 }]));
    expect(ids(finalRankingFromTotals(everyone, noSwiss, playoff, swissOrder)).split(' ').slice(2, 4)).toEqual(['P6', 'P1']);
    expect(ids(finalRankingFromTotals(everyone, swissTotals, playoff, swissOrder)).split(' ').slice(2, 4)).toEqual(['P1', 'P6']);
  });

  it('a semi-final loser always stands before a quarter-final loser, whatever their points', () => {
    const rows = finalRankingFromTotals(everyone, totals([...swissTotals].map(([id, v]) => [Number(id.slice(1)), id === 'P6' ? 0 : v.points, v.goalDifference] as [number, number, number])), playoff, swissOrder);
    const place = (id: string) => rows.find(r => r.player.id === id)!.place;
    expect(place('P6')).toBeLessThan(place('P3'));
    expect(place('P6')).toBeLessThan(place('P4'));
  });

  it('the opponent decides when points and goal difference are level', () => {
    // P7 and P8 are level (7 points, -3); P7 lost to the champion, P8 to the third place
    const rows = finalRankingFromTotals(everyone, swissTotals, playoff, swissOrder);
    const place = (id: string) => rows.find(r => r.player.id === id)!.place;
    expect(place('P7')).toBeLessThan(place('P8'));
    // swap the opponents and the order flips
    const swapped = [
      po(3, 1, 7, 2, 1), po(3, 4, 5, 2, 3, true), po(3, 2, 8, 4, 0), po(3, 3, 6, 1, 2),
      po(2, 1, 5, 1, 2), po(2, 2, 6, 2, 1, true), po(1, 5, 2, 0, 3),
    ];
    const rows2 = finalRankingFromTotals(everyone, totals([[1, 10, 12], [2, 9, 8], [3, 9, 5], [4, 8, 6], [5, 8, 3], [6, 7, 2], [7, 7, 0], [8, 7, 0], [9, 5, 0], [10, 4, -3], [11, 3, -6], [12, 2, -9]]), swapped, swissOrder);
    // P7 lost 1:2 to P1 (place 3), P8 lost 0:4 to P2 (place 1): P8 has the better opponent only when the rest is level
    const pl = (id: string) => rows2.find(r => r.player.id === id)!.place;
    expect(rows2.find(r => r.player.id === 'P7')!.goalDifference).toBe(-1);
    expect(rows2.find(r => r.player.id === 'P8')!.goalDifference).toBe(-4);
    expect(pl('P7')).toBeLessThan(pl('P8'));
  });

  it('players that did not reach the playoff follow in the order of the Swiss ranking', () => {
    const rows = finalRankingFromTotals(everyone, swissTotals, playoff, ['P12', 'P11', 'P10', 'P9', ...swissOrder]);
    expect(ids(rows).split(' ').slice(8)).toEqual(['P12', 'P11', 'P10', 'P9']);
  });

  it('without a playoff the Swiss ranking is the final ranking', () => {
    expect(ids(finalRankingFromTotals(everyone, swissTotals, [], swissOrder))).toBe(swissOrder.join(' '));
  });

  it('a playoff bye counts as no game and no points; the player advances', () => {
    const six = Array.from({ length: 6 }, (_, i) => player(P(i + 1)));
    const t = totals([[1, 8, 4], [2, 7, 3], [3, 6, 2], [4, 5, 1], [5, 3, 0], [6, 2, -2]]);
    const bye = game(P(1), 'null-bye', 0, 0, { phase: 'playoff', playoffRound: 2, isBye: true, awayPlayer: { id: 'null-x', name: '–' } });
    const sf = po(2, 2, 3, 1, 0);
    const final = po(1, 1, 2, 2, 1);
    const rows = finalRankingFromTotals(six, t, [bye, sf, final], six.map(p => p.id));
    expect(ids(rows).split(' ').slice(0, 3)).toEqual(['P1', 'P2', 'P3']);
    expect(rows.find(r => r.player.id === 'P1')!.playoffPoints).toBe(2);   // only the final counts
  });

  it('agrees with the reference implementation on random tournaments', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 200; t++) {
      const n = 8 + Math.floor(rnd() * 9);
      const all = Array.from({ length: n }, (_, i) => player(`q${i}`));
      const swissOrderIds = shuffled(all.map(p => p.id), rnd);
      const totalsMap = new Map(all.map(p => [p.id, { points: Math.floor(rnd() * 14), goalDifference: Math.floor(rnd() * 21) - 10 }]));
      // quarter-final bracket of the first 8 of the Swiss order, then semi-finals and the final
      const q = swissOrderIds.slice(0, 8);
      // A drawn game is decided by the next goal (sudden death), so the winner has exactly one goal more
      const play = (round: number, a: string, b: string) => {
        let hs = Math.floor(rnd() * 4);
        let as = Math.floor(rnd() * 4);
        const suddenDeath = hs === as;
        if (suddenDeath) { if (rnd() < 0.5) hs += 1; else as += 1; }
        return game(a, b, hs, as, { phase: 'playoff', playoffRound: round, suddenDeath });
      };
      const winner = (m: Match) => (m.homeScore! > m.awayScore! ? m.homePlayer.id : m.awayPlayer.id);
      const qf = [play(3, q[0], q[7]), play(3, q[3], q[4]), play(3, q[1], q[6]), play(3, q[2], q[5])];
      const sf = [play(2, winner(qf[0]), winner(qf[1])), play(2, winner(qf[2]), winner(qf[3]))];
      const fin = play(1, winner(sf[0]), winner(sf[1]));
      const matches = [...qf, ...sf, fin];
      const mine = finalRankingFromTotals(all, totalsMap, matches, swissOrderIds).map(r => r.player.id);
      const reference = referenceFinalRanking(
        matches.map(m => ({ round: m.playoffRound, home: m.homePlayer.id, away: m.awayPlayer.id, hs: m.homeScore, as: m.awayScore, sd: !!m.suddenDeath })),
        swissOrderIds,
        new Map([...totalsMap].map(([id, v]) => [id, { points: v.points, gd: v.goalDifference }])),
      );
      expect(mine, `tournament ${t}`).toEqual(reference);
    }
  });

  it('finalRankingSwiss takes the Swiss points from the games', () => {
    const three = players(['A', 'B', 'C']);
    const swissGames = games([['A', 'B', 3, 0], ['A', 'C', 1, 0], ['B', 'C', 0, 0]]);
    const final = game('B', 'A', 1, 2, { phase: 'playoff', playoffRound: 1 });
    const rows = finalRankingSwiss(three, swissGames, [final], ['A', 'B', 'C']);
    expect(ids(rows)).toBe('A B C');
    expect(rows[0].points).toBe(4 + 2);   // Swiss: win, win; playoff: win
    expect(rows[1].points).toBe(1 + 0);   // Swiss: loss and draw; playoff: loss
    expect(rows[0].goalDifference).toBe(3 + 1 + 1);
  });
});


describe('players out of competition ("a.K.")', () => {
  const named = (names: string[]) => names.map(n => ({ id: n, name: n }));
  // A beats everybody, B beats C and D, C beats D: ranks A, B, C, D (legacy places 1, 2, 3, 4)
  const ranking = (names: string[]) =>
    rankPlayers(named(names), [
      game(names[0], names[1], 3, 0), game(names[0], names[2], 3, 0), game(names[0], names[3], 3, 0),
      game(names[1], names[2], 2, 0), game(names[1], names[3], 2, 0), game(names[2], names[3], 1, 0),
    ].map(m => ({ ...m, homePlayer: { id: m.homePlayer.id, name: m.homePlayer.id }, awayPlayer: { id: m.awayPlayer.id, name: m.awayPlayer.id } })), 'legacy');
  const ids = (r: { winner?: Player; runnerUp?: Player }) => [r.winner?.id, r.runnerUp?.id];

  it('recognises the marker, whatever the spelling, and nothing else', () => {
    for (const name of ['Max Daub a.K.', 'max daub A.K.', 'Max Daub a. K.', 'Max Daub aK', 'Max Daub a.k', ' Max Daub a.K. ']) {
      expect(isOutOfCompetition(name)).toBe(true);
    }
    for (const name of ['Max Daub', 'Mak', 'Frank', 'Jan Klak', 'Hanna K.', 'a.K. Max']) expect(isOutOfCompetition(name)).toBe(false);
  });

  it('is the same as winnerAndRunnerUp when nobody is out of competition', () => {
    const r = ranking(['A', 'B', 'C', 'D']);
    expect(leagueTitleHolders(r)).toEqual(winnerAndRunnerUp(r));
    for (const scenario of [
      rankPlayers(players(['A', 'B', 'C']), games([['A', 'B', 2, 2], ['A', 'C', 1, 0], ['B', 'C', 1, 0]]), 'dtkv2026'),
      rankPlayers(players(['A', 'B', 'C', 'D']), games([['A', 'B', 3, 0], ['A', 'C', 3, 0], ['A', 'D', 3, 0], ['B', 'C', 1, 1], ['B', 'D', 1, 1], ['C', 'D', 1, 1]]), 'dtkv2026'),
      rankPlayers(players(['A']), [], 'legacy'),
      rankPlayers([], [], 'legacy'),
    ]) {
      expect(leagueTitleHolders(scenario)).toEqual(winnerAndRunnerUp(scenario));
    }
  });

  it('lets the next player move up when the winner is out of competition', () => {
    expect(ids(leagueTitleHolders(ranking(['A a.K.', 'B', 'C', 'D'])))).toEqual(['B', 'C']);
  });

  it('gives the runner-up title to the next player when the runner-up is out of competition', () => {
    expect(ids(leagueTitleHolders(ranking(['A', 'B a.K.', 'C', 'D'])))).toEqual(['A', 'C']);
  });

  it('changes nothing when the player out of competition is further back', () => {
    expect(ids(leagueTitleHolders(ranking(['A', 'B', 'C a.K.', 'D'])))).toEqual(['A', 'B']);
    expect(ids(leagueTitleHolders(ranking(['A', 'B', 'C', 'D a.K.'])))).toEqual(['A', 'B']);
  });

  it('gives no runner-up when only one player is left, and no title when nobody is', () => {
    expect(ids(leagueTitleHolders(rankPlayers(named(['A a.K.', 'B']), [{ ...game('A', 'B', 1, 0), homePlayer: { id: 'A a.K.', name: 'A a.K.' }, awayPlayer: { id: 'B', name: 'B' } }], 'legacy')))).toEqual(['B', undefined]);
    expect(ids(leagueTitleHolders(rankPlayers(named(['A a.K.']), [], 'legacy')))).toEqual([undefined, undefined]);
  });

  it('still gives no title for a place that is shared after the move up', () => {
    // dtkv2026: A out of competition and first; B and C level at place 2 -> they are level for the title now
    const r = rankPlayers(named(['A a.K.', 'B', 'C', 'D']), [
      { ...game('A', 'B', 3, 0), homePlayer: { id: 'A a.K.', name: 'A a.K.' }, awayPlayer: { id: 'B', name: 'B' } },
      { ...game('A', 'C', 3, 0), homePlayer: { id: 'A a.K.', name: 'A a.K.' }, awayPlayer: { id: 'C', name: 'C' } },
      { ...game('A', 'D', 3, 0), homePlayer: { id: 'A a.K.', name: 'A a.K.' }, awayPlayer: { id: 'D', name: 'D' } },
      { ...game('B', 'C', 1, 1), homePlayer: { id: 'B', name: 'B' }, awayPlayer: { id: 'C', name: 'C' } },
      { ...game('B', 'D', 1, 1), homePlayer: { id: 'B', name: 'B' }, awayPlayer: { id: 'D', name: 'D' } },
      { ...game('C', 'D', 1, 1), homePlayer: { id: 'C', name: 'C' }, awayPlayer: { id: 'D', name: 'D' } },
    ], 'dtkv2026');
    expect(r.places.slice(1)).toEqual([2, 2, 2]);
    expect(ids(leagueTitleHolders(r))).toEqual([undefined, undefined]);
  });
});
