import { describe, expect, it } from 'vitest';
import { rankSession, sessionFinalRanking } from '@/lib/swissRanking';
import { computeSwissStats } from '@/lib/swissPairing';
import { playoffResultError, toPlayoffMatches } from '@/lib/tournamentPhases';
import { buildTrainingSheets } from '@/lib/exportXlsx';
import { Match, Player, TrainingSession } from '@/types';
import { SwissRound } from '@/types/swiss';

const player = (id: string): Player => ({ id, name: `Spieler ${id}` });
let counter = 0;
const game = (home: string, away: string, hs: number, as: number, extra: Partial<Match> = {}): Match => ({
  id: `m${++counter}`, round: 1, homePlayer: player(home), awayPlayer: player(away),
  homeScore: hs, awayScore: as, isCompleted: true, ...extra,
});
const round = (n: number, matches: Match[]): SwissRound => ({ roundNumber: n, phase: 'swiss', matches, isCompleted: true });

const training = (rule: TrainingSession['rankingRule'], ms: [string, string, number, number][]): TrainingSession => ({
  id: 's', date: '2026-11-12T18:00:00Z', players: ['A', 'B', 'C', 'D'].map(player),
  matches: ms.map(([h, a, hs, as]) => game(h, a, hs, as)), isCompleted: true, roundCount: 3, matchesPerPairing: 1, rankingRule: rule,
});
// Case 1 of the DTKV rule: A beat B, but B has the far better goal difference
const caseOne: [string, string, number, number][] =
  [['A', 'B', 1, 0], ['C', 'A', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 9, 0], ['B', 'D', 9, 0], ['D', 'C', 1, 0]];
const order = (s: TrainingSession) => rankSession(s).stats.map(r => r.player.id).join('');

describe('rankSession uses the rule the evening was played under', () => {
  it('an evening without a rule, and a legacy evening, keep the old order (goal difference first)', () => {
    expect(order(training(undefined, caseOne))).toBe('BADC');
    expect(order(training('legacy', caseOne))).toBe('BADC');
  });
  it('a DTKV evening uses the direct comparison first', () => {
    expect(order(training('dtkv2026', caseOne))).toBe('ABDC');
  });
  it('leaves the playoff games out of the group ranking', () => {
    const s = training('dtkv2026', caseOne);
    s.matches.push(game('C', 'D', 9, 0, { phase: 'playoff', playoffRound: 1 }));
    expect(order(s)).toBe('ABDC');
  });
});

describe('Swiss standings: tie-breaks after points per game and Buchholz', () => {
  const ids = ['A', 'B'].map(player);

  it('goals scored decide when the goal difference is level', () => {
    const rounds = [round(1, [game('A', 'X', 3, 1), game('B', 'Y', 5, 3)])];
    const standings = computeSwissStats([...ids, player('X'), player('Y')], rounds).map(s => s.player.id);
    expect(standings.indexOf('B')).toBeLessThan(standings.indexOf('A'));
  });

  it('the direct comparison decides when points per game, Buchholz, goal difference and goals are all level', () => {
    // A and B both: one win, one loss, 1:1 goals; every opponent has one win and one loss too. A beat B directly.
    const rounds = [
      round(1, [game('A', 'B', 1, 0), game('D', 'E', 1, 0)]),
      round(2, [game('C', 'A', 1, 0), game('B', 'D', 1, 0), game('F', 'C', 1, 0)]),
    ];
    const everyone = ['A', 'B', 'C', 'D', 'E', 'F'];
    const standings = (list: string[], lot?: Record<string, number>) =>
      computeSwissStats(list.map(player), rounds, lot).map(s => s.player.id);
    const stats = computeSwissStats(everyone.map(player), rounds);
    const a = stats.find(s => s.player.id === 'A')!;
    const b = stats.find(s => s.player.id === 'B')!;
    // really level on everything that comes before the direct comparison
    expect([a.avgPoints, a.buchholz, a.goalDifference, a.goalsFor]).toEqual([b.avgPoints, b.buchholz, b.goalDifference, b.goalsFor]);

    const place = (list: string[], lot?: Record<string, number>) => {
      const order = standings(list, lot);
      return order.indexOf('A') < order.indexOf('B');
    };
    expect(place(everyone)).toBe(true);
    expect(place(['B', 'A', 'C', 'D', 'E', 'F'])).toBe(true);          // not an accident of the list order
    expect(place(everyone, { A: 0.9, B: 0.1 })).toBe(true);            // the lot comes after the direct comparison
  });

  it('the lot is the last criterion, and it does not change the order when nothing else is level', () => {
    const rounds = [round(1, [game('A', 'X', 1, 0), game('B', 'Y', 1, 0)])];
    const players = [...ids, player('X'), player('Y')];
    const first = (lot: Record<string, number>) => computeSwissStats(players, rounds, lot).map(s => s.player.id).slice(0, 2);
    expect(first({ A: 0.1, B: 0.9 })).toEqual(['A', 'B']);
    expect(first({ A: 0.9, B: 0.1 })).toEqual(['B', 'A']);
    // a clear winner stays ahead whatever the lot says
    const clear = computeSwissStats(players, [round(1, [game('A', 'X', 4, 0), game('B', 'Y', 1, 0)])], { A: 0.9, B: 0.1 });
    expect(clear[0].player.id).toBe('A');
  });
});

describe('playoffResultError: a knock-out game has no draw', () => {
  it('rejects a draw', () => {
    expect(playoffResultError(2, 2, false)).toMatch(/kein Unentschieden/);
    expect(playoffResultError(0, 0, true)).toMatch(/kein Unentschieden/);
  });
  it('accepts a normal result and a one-goal sudden-death result', () => {
    expect(playoffResultError(3, 1, false)).toBeNull();
    expect(playoffResultError(1, 2, true)).toBeNull();
    expect(playoffResultError(3, 2, true)).toBeNull();
  });
  it('a sudden-death game is won by exactly one goal', () => {
    expect(playoffResultError(4, 1, true)).toMatch(/genau einem Tor/);
  });
  it('rejects scores that are not whole non-negative numbers', () => {
    expect(playoffResultError(-1, 2, false)).toMatch(/gültige Tore/);
    expect(playoffResultError(1.5, 2, false)).toMatch(/gültige Tore/);
    expect(playoffResultError(Number.NaN, 2, false)).toMatch(/gültige Tore/);
  });
});

// A Swiss tournament of four players: group phase as round robin, then semi-finals and the final
function swissEvening(): TrainingSession {
  const swiss = [
    game('A', 'B', 2, 0, { round: 1, phase: 'swiss' }), game('C', 'D', 1, 0, { round: 1, phase: 'swiss' }),
    game('A', 'C', 2, 1, { round: 2, phase: 'swiss' }), game('B', 'D', 1, 0, { round: 2, phase: 'swiss' }),
    game('A', 'D', 3, 0, { round: 3, phase: 'swiss' }), game('B', 'C', 0, 0, { round: 3, phase: 'swiss' }),
  ];
  const playoff = [
    game('A', 'D', 2, 1, { phase: 'playoff', playoffRound: 2, matchNumber: 1, round: 4 }),
    game('B', 'C', 1, 2, { phase: 'playoff', playoffRound: 2, matchNumber: 2, round: 4, suddenDeath: true }),
    game('A', 'C', 0, 1, { phase: 'playoff', playoffRound: 1, matchNumber: 1, round: 5, suddenDeath: true }),
  ];
  return {
    id: 'sw', name: 'Schweizer System', date: '2026-11-12T18:00:00Z', players: ['A', 'B', 'C', 'D'].map(player),
    matches: [...swiss, ...playoff], isCompleted: true, roundCount: 3, matchesPerPairing: 1, tournamentType: 'swiss',
  };
}

describe('sessionFinalRanking', () => {
  it('is not available for training evenings or Swiss tournaments without a playoff', () => {
    expect(sessionFinalRanking(training('dtkv2026', caseOne))).toBeNull();
    const noPlayoff = swissEvening();
    noPlayoff.matches = noPlayoff.matches.filter(m => m.phase !== 'playoff');
    expect(sessionFinalRanking(noPlayoff)).toBeNull();
  });

  it('places by round of elimination: winner, final, semi-final losers by points (sudden death counts 0.5)', () => {
    const rows = sessionFinalRanking(swissEvening())!;
    // Swiss: A 6, C 3, B 3, D 0 points. Playoff: C beat B after sudden death (1.5), then A after sudden death (1.5); A lost 0.5
    expect(rows.map(r => r.player.id)).toEqual(['C', 'A', 'B', 'D']);
    const row = (id: string) => rows.find(r => r.player.id === id)!;
    expect(row('C').playoffPoints).toBe(3);
    expect(row('A').playoffPoints).toBe(2 + 0.5);
    expect(row('B').playoffPoints).toBe(0.5);
    expect(row('D').playoffPoints).toBe(0);
    expect(row('C').points).toBe(3 + 3);
    expect(row('A').points).toBe(6 + 2.5);
    expect(rows.map(r => r.outIn)).toEqual(['winner', 'final', 'semi', 'semi']);
  });

  it('the flat playoff matches keep the sudden-death flag when the bracket is rebuilt', () => {
    const bracket = toPlayoffMatches(swissEvening().matches);
    expect(bracket.filter(m => m.suddenDeath).length).toBe(2);
  });
});

describe('Excel export of a Swiss tournament', () => {
  const cellValue = (cell: unknown) => (cell && typeof cell === 'object' ? (cell as { value: unknown }).value : cell);

  it('has the final ranking as its own sheet and marks sudden-death games', () => {
    const sheets = buildTrainingSheets(swissEvening());
    expect(sheets.map(s => s.sheet)).toContain('Abschlussrangliste');
    const ranking = sheets.find(s => s.sheet === 'Abschlussrangliste')!;
    expect(ranking.data[0].map(cellValue)).toEqual(['Platz', 'Spieler', 'Ausgeschieden in', 'Punkte', 'davon Playoff', 'Diff']);
    expect(ranking.data.slice(1).map(r => cellValue(r[1]))).toEqual(['Spieler C', 'Spieler A', 'Spieler B', 'Spieler D']);
    expect(cellValue(ranking.data[1][3])).toBe(6);
    expect(cellValue(ranking.data[2][3])).toBe(8.5);
    const playoff = sheets.find(s => s.sheet === 'Playoff')!;
    expect(playoff.data.slice(1).map(r => cellValue(r[3]))).toEqual(expect.arrayContaining(['1:2 SD', '0:1 SD', '2:1']));
  });

  it('a training evening has no such sheet', () => {
    expect(buildTrainingSheets(training('dtkv2026', caseOne)).map(s => s.sheet)).not.toContain('Abschlussrangliste');
  });
});
