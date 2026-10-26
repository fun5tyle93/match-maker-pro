import { describe, expect, it } from 'vitest';
import {
  availableYears,
  buildOverview,
  buildRecords,
  eveningWinner,
  FORM_LENGTH,
  headToHead,
  MIN_GAMES_FOR_RANKING,
  formatShortDate,
  playerKey,
  sortRecords,
} from '@/lib/statistics';
import { Match, TrainingSession } from '@/types';

type Result = [string, string, number, number];

let idCounter = 0;
const player = (name: string, evening: string) => ({ id: `${evening}-${name}`, name });

function evening(
  id: string,
  date: string,
  results: Result[],
  options: { name?: string; extra?: Partial<Match>[]; players?: string[] } = {},
): TrainingSession {
  const names = new Set<string>(options.players ?? []);
  results.forEach(([h, a]) => (names.add(h), names.add(a)));
  const matches: Match[] = results.map(([home, away, hs, as], i) => ({
    id: `m${++idCounter}`,
    round: i + 1,
    homePlayer: player(home, id),
    awayPlayer: player(away, id),
    homeScore: hs,
    awayScore: as,
    isCompleted: true,
  }));
  options.extra?.forEach(extra =>
    matches.push({
      id: `m${++idCounter}`, round: 99, homePlayer: player('x', id), awayPlayer: player('y', id),
      homeScore: null, awayScore: null, isCompleted: false, ...extra,
    }),
  );
  return {
    id,
    name: options.name,
    date,
    players: [...names].map(n => player(n, id)),
    matches,
    isCompleted: true,
    roundCount: matches.length,
    matchesPerPairing: 1,
  };
}

const record = (records: ReturnType<typeof buildRecords>, name: string) => records.find(r => r.key === playerKey(name))!;

describe('playerKey', () => {
  it('ignores case and surrounding or repeated spaces', () => {
    expect(playerKey('  Max   Daub ')).toBe('max daub');
    expect(playerKey('MAX DAUB')).toBe(playerKey('max daub'));
  });
});

describe('formatShortDate', () => {
  it('writes day and month with two digits, like the history', () => {
    expect(formatShortDate('2026-05-08T18:00:00Z')).toBe('08.05.2026');
    expect(formatShortDate('2026-12-12T18:00:00Z')).toBe('12.12.2026');
  });
});

describe('buildRecords', () => {
  const sessions = [
    evening('e1', '2026-03-06T18:00:00Z', [['Anna', 'Ben', 3, 1], ['Cem', 'Anna', 2, 2]], { name: 'Abend 1' }),
    evening('e2', '2026-03-20T18:00:00Z', [['ben', 'anna', 0, 4], ['Cem', 'ben', 5, 0]], { name: 'Abend 2' }),
  ];
  const records = buildRecords(sessions);

  it('merges a player over evenings even though the ids differ (names differ in case)', () => {
    expect(records.map(r => r.key).sort()).toEqual(['anna', 'ben', 'cem']);
    expect(record(records, 'Anna').evenings).toBe(2);
  });

  it('counts wins, draws, losses, goals and points', () => {
    const anna = record(records, 'Anna');
    expect(anna).toMatchObject({ games: 3, wins: 2, draws: 1, losses: 0, goalsFor: 9, goalsAgainst: 3, goalDifference: 6, points: 5 });
    const ben = record(records, 'Ben');
    expect(ben).toMatchObject({ games: 3, wins: 0, draws: 0, losses: 3, points: 0, goalsFor: 1, goalsAgainst: 12 });
  });

  it('derives win rate and average points', () => {
    const anna = record(records, 'Anna');
    expect(anna.winRate).toBeCloseTo(2 / 3);
    expect(anna.avgPoints).toBeCloseTo(5 / 3);
    expect(record(records, 'Ben').winRate).toBe(0);
  });

  it('keeps the form oldest first with opponent and score from the player\'s view', () => {
    const form = record(records, 'Anna').form;
    expect(form.map(f => f.result)).toEqual(['W', 'D', 'W']);
    expect(form[0]).toMatchObject({ opponent: 'Ben', goalsFor: 3, goalsAgainst: 1, eveningName: 'Abend 1' });
    expect(form[2]).toMatchObject({ opponent: 'ben', goalsFor: 4, goalsAgainst: 0, eveningName: 'Abend 2' });
    expect(FORM_LENGTH).toBe(5);
  });

  it('uses the most recent spelling as display name', () => {
    expect(record(records, 'Ben').name).toBe('ben'); // spelled "ben" on the newer evening
    expect(record(records, 'Anna').name).toBe('anna');
  });

  it('ignores open matches, matches without score, byes and playoff placeholders', () => {
    const noisy = evening('e3', '2026-04-03T18:00:00Z', [['Dora', 'Emil', 1, 0]], {
      extra: [
        { homePlayer: player('Dora', 'e3'), awayPlayer: player('Emil', 'e3'), isCompleted: false },
        { homePlayer: player('Dora', 'e3'), awayPlayer: player('Emil', 'e3'), isCompleted: true, homeScore: null, awayScore: null },
        { homePlayer: player('Dora', 'e3'), awayPlayer: player('Emil', 'e3'), isCompleted: true, homeScore: 9, awayScore: 0, isBye: true },
        { homePlayer: { id: 'null-1', name: '–' }, awayPlayer: player('Emil', 'e3'), isCompleted: true, homeScore: 9, awayScore: 0 },
      ],
    });
    const r = buildRecords([noisy]);
    expect(record(r, 'Dora').games).toBe(1);
    expect(record(r, 'Emil').games).toBe(1);
    expect(r.some(x => x.name === '–')).toBe(false);
  });

  it('counts players who are listed on an evening as present, even without a played match', () => {
    const s = evening('e4', '2026-04-10T18:00:00Z', [['Fritz', 'Gabi', 1, 0]], { players: ['Hans'] });
    const r = buildRecords([s]);
    expect(record(r, 'Hans')).toMatchObject({ evenings: 1, games: 0, winRate: 0, avgPoints: 0 });
  });

  it('skips evenings without any played match', () => {
    const empty = evening('e5', '2026-05-01T18:00:00Z', [], { players: ['Ida', 'Jan'] });
    expect(buildRecords([empty])).toEqual([]);
  });
});

describe('titles', () => {
  it('gives the evening win to the first place of the table', () => {
    const s = evening('t1', '2026-03-06T18:00:00Z', [['Anna', 'Ben', 3, 1], ['Ben', 'Cem', 2, 2], ['Anna', 'Cem', 1, 0]]);
    expect(eveningWinner(s)).toBe('Anna');
    expect(record(buildRecords([s]), 'Anna').titles).toBe(1);
    expect(record(buildRecords([s]), 'Ben').titles).toBe(0);
  });

  it('gives the evening win to the playoff champion, not to the table leader', () => {
    const base = evening('t2', '2026-03-06T18:00:00Z', [['Anna', 'Ben', 3, 1], ['Anna', 'Cem', 2, 0], ['Ben', 'Cem', 1, 0]]);
    base.matches.push({
      id: 'final', round: 1, phase: 'playoff', playoffRound: 1, matchNumber: 1,
      homePlayer: player('Anna', 't2'), awayPlayer: player('Ben', 't2'), homeScore: 0, awayScore: 2, isCompleted: true,
    });
    expect(eveningWinner(base)).toBe('Ben');
    const r = buildRecords([base]);
    expect(record(r, 'Ben').titles).toBe(1);
    expect(record(r, 'Anna').titles).toBe(0);
    // playoff games count as games
    expect(record(r, 'Anna').games).toBe(3);
  });

  it('has no winner when nothing was played', () => {
    expect(eveningWinner(evening('t3', '2026-03-06T18:00:00Z', []))).toBeUndefined();
  });
});

describe('years and overview', () => {
  const sessions = [
    evening('y1', '2025-12-12T18:00:00Z', [['Anna', 'Ben', 1, 0]]),
    evening('y2', '2026-03-06T18:00:00Z', [['Anna', 'Cem', 2, 2], ['Cem', 'Ben', 4, 1]]),
    evening('y3', '2026-05-01T18:00:00Z', []),
  ];

  it('lists years with played evenings, newest first', () => {
    expect(availableYears(sessions)).toEqual([2026, 2025]);
  });

  it('limits the records to one year', () => {
    expect(record(buildRecords(sessions, 2026), 'Anna').games).toBe(1);
    expect(record(buildRecords(sessions), 'Anna').games).toBe(2);
  });

  it('summarises evenings, games, players and goals', () => {
    expect(buildOverview(sessions)).toMatchObject({ evenings: 2, games: 3, players: 3, goals: 10 });
    expect(buildOverview(sessions, 2026)).toMatchObject({ evenings: 1, games: 2, goals: 9 });
    expect(buildOverview(sessions, 2026).goalsPerGame).toBeCloseTo(4.5);
    expect(buildOverview([])).toEqual({ evenings: 0, games: 0, players: 0, goals: 0, goalsPerGame: 0 });
  });
});

describe('headToHead', () => {
  const sessions = [
    evening('h1', '2026-03-06T18:00:00Z', [['Anna', 'Ben', 3, 1], ['Ben', 'Anna', 2, 2]], { name: 'Abend 1' }),
    evening('h2', '2026-03-20T18:00:00Z', [['Ben', 'Anna', 5, 0], ['Anna', 'Cem', 1, 0]], { name: 'Abend 2' }),
  ];

  it('counts the matches between two players from both sides', () => {
    const h = headToHead(sessions, 'anna', 'ben');
    expect(h).toMatchObject({ games: 3, winsA: 1, draws: 1, winsB: 1, goalsA: 5, goalsB: 8 });
  });

  it('is the mirror image when the players are swapped', () => {
    const h = headToHead(sessions, 'ben', 'anna');
    expect(h).toMatchObject({ games: 3, winsA: 1, draws: 1, winsB: 1, goalsA: 8, goalsB: 5 });
  });

  it('lists the meetings newest first with the result for player A', () => {
    const h = headToHead(sessions, 'anna', 'ben');
    expect(h.meetings.map(m => m.result)).toEqual(['L', 'D', 'W']);
    expect(h.meetings[0]).toMatchObject({ eveningName: 'Abend 2', goalsA: 0, goalsB: 5 });
  });

  it('ignores matches against other players and the same player twice', () => {
    expect(headToHead(sessions, 'anna', 'cem').games).toBe(1);
    expect(headToHead(sessions, 'anna', 'anna').games).toBe(0);
    expect(headToHead(sessions, 'anna', 'nobody').games).toBe(0);
  });

  it('respects the year', () => {
    expect(headToHead(sessions, 'anna', 'ben', 2025).games).toBe(0);
    expect(headToHead(sessions, 'anna', 'ben', 2026).games).toBe(3);
  });
});

describe('sortRecords', () => {
  const make = (name: string, games: number, wins: number): ReturnType<typeof buildRecords>[number] => ({
    key: playerKey(name), name, evenings: 1, games, wins, draws: 0, losses: games - wins,
    goalsFor: wins, goalsAgainst: 0, goalDifference: wins, points: wins * 2,
    avgPoints: games ? (wins * 2) / games : 0, winRate: games ? wins / games : 0, titles: 0, form: [],
  });
  const lucky = make('Lucky', 2, 2); // 100 % after only two games
  const solid = make('Solid', 20, 14);
  const weak = make('Weak', 20, 4);

  it('puts players with few games last when sorting by a rate', () => {
    expect(MIN_GAMES_FOR_RANKING).toBe(10);
    expect(sortRecords([lucky, weak, solid], 'winRate', 'desc').map(r => r.name)).toEqual(['Solid', 'Weak', 'Lucky']);
    expect(sortRecords([lucky, weak, solid], 'avgPoints', 'asc').map(r => r.name)).toEqual(['Weak', 'Solid', 'Lucky']);
  });

  it('does not apply that rule to counts', () => {
    expect(sortRecords([lucky, weak, solid], 'wins' as never, 'desc')).toHaveLength(3); // unknown key must not throw
    expect(sortRecords([solid, lucky], 'games', 'asc').map(r => r.name)).toEqual(['Lucky', 'Solid']);
  });

  it('sorts by name with German collation and breaks ties by games', () => {
    expect(sortRecords([make('Zoe', 1, 0), make('Ägidius', 1, 0), make('Bert', 1, 0)], 'name', 'asc').map(r => r.name)).toEqual(['Ägidius', 'Bert', 'Zoe']);
    expect(sortRecords([make('B', 5, 1), make('A', 9, 1)], 'goalDifference', 'desc').map(r => r.name)).toEqual(['A', 'B']);
  });

  it('does not change the input array', () => {
    const input = [lucky, weak, solid];
    sortRecords(input, 'winRate', 'desc');
    expect(input.map(r => r.name)).toEqual(['Lucky', 'Weak', 'Solid']);
  });
});
