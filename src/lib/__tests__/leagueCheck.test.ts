import { describe, expect, it } from 'vitest';
import { checkLeague, openingsFor, OpeningLookup } from '@/lib/leagueCheck';
import { bookSessions } from '@/lib/leagueStandings';
import { League, Match, PlayerStats, TrainingSession } from '@/types';

const player = (name: string, ref?: string) => ({ id: `id-${name}`, name, ...(ref ? { ref } : {}) });
let n = 0;
const match = (home: ReturnType<typeof player>, away: ReturnType<typeof player>, hs: number, as: number): Match => ({
  id: `m${++n}`, round: 1, homePlayer: home, awayPlayer: away, homeScore: hs, awayScore: as, isCompleted: true,
});
/** Anna beats Ben 3:1, Anna beats Cem 2:0, Ben draws with Cem 1:1 */
function evening(id: string, date: string, extra: Partial<TrainingSession> = {}): TrainingSession {
  const [a, b, c] = [player('Anna', 'R-a'), player('Ben', 'R-b'), player('Cem', 'R-c')];
  return {
    id, date, players: [a, b, c], isCompleted: true, roundCount: 1, matchesPerPairing: 1, transferredToLeagues: ['L'],
    matches: [match(a, b, 3, 1), match(a, c, 2, 0), match(b, c, 1, 1)], ...extra,
  };
}
const row = (name: string, ref: string | undefined, v: Partial<PlayerStats>): PlayerStats => ({
  player: player(name, ref), wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, pointsAgainst: 0,
  goalDifference: 0, championships: 0, viceChampionships: 0, ...v,
});
const leagueOf = (rows: PlayerStats[], isEternal = false): League => ({ id: 'L', name: 'Liga', year: 2026, createdAt: '', playerStats: rows, isEternal });
const zero = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, pointsAgainst: 0, goalDifference: 0, championships: 0, viceChampionships: 0 };

const sessions = [evening('e1', '2026-03-01T18:00:00Z'), evening('e2', '2026-04-01T18:00:00Z')];
/** A league whose rows are the given history plus what the two evenings add up to */
function consistent(history: Record<string, Partial<typeof zero>>) {
  const booked = bookSessions(false, sessions);
  const rows = booked.map(b => {
    const h = { ...zero, ...(history[b.player.name] ?? {}) };
    return row(b.player.name, b.player.ref, Object.fromEntries(Object.keys(zero).map(c => [c, (b as never)[c] + (h as never)[c]])) as Partial<PlayerStats>);
  });
  const openings: OpeningLookup = new Map(Object.entries(history).map(([name, h]) => [booked.find(b => b.player.name === name)!.player.ref!, { ...zero, ...h }]));
  return { league: leagueOf(rows), openings };
}

describe('checkLeague', () => {
  it('passes when every row is the opening balance plus the evenings', () => {
    const { league, openings } = consistent({ Anna: { wins: 10, points: 20, championships: 3 }, Ben: { losses: 4 } });
    const result = checkLeague(league, sessions, openings);
    expect(result).toMatchObject({ ok: true, differences: [], missingRows: [], notChecked: [], unsupported: [], checkedRows: 3 });
  });

  it('reports every number that was changed by hand, with computed and stored value', () => {
    const { league, openings } = consistent({ Anna: { wins: 10 } });
    const ben = league.playerStats.find(s => s.player.name === 'Ben')!;
    ben.championships = (ben.championships ?? 0) + 1;
    league.playerStats.find(s => s.player.name === 'Anna')!.points -= 2;
    const result = checkLeague(league, sessions, openings);
    expect(result.ok).toBe(false);
    const text = result.differences.map(d => `${d.name}:${d.column}:${d.computed}->${d.stored}`).sort();
    expect(text).toEqual(['Anna:points:8->6', 'Ben:championships:0->1']);
  });

  it('treats a player with a row but no opening balance as starting from nothing', () => {
    const { league, openings } = consistent({});
    league.playerStats.push(row('Dora', 'R-d', { points: 12 }));
    const result = checkLeague(league, sessions, openings);
    expect(result.differences).toEqual([{ name: 'Dora', column: 'points', computed: 0, stored: 12 }]);
  });

  it('reports a player whom the evenings booked but who has no row any more', () => {
    const { league, openings } = consistent({});
    league.playerStats = league.playerStats.filter(s => s.player.name !== 'Cem');
    const result = checkLeague(league, sessions, openings);
    expect(result.ok).toBe(false);
    expect(result.missingRows.map(m => m.name)).toEqual(['Cem']);
    expect(result.missingRows[0].contribution).toMatchObject({ points: 2, draws: 2, losses: 2 }); // per evening: one draw, one loss
  });

  it('does not check rows without a fixed identity, and says so', () => {
    const { league, openings } = consistent({});
    league.playerStats.push(row('Ohne Identität', undefined, { points: 99 }));
    const result = checkLeague(league, sessions, openings);
    expect(result.ok).toBe(true);
    expect(result.notChecked).toEqual(['Ohne Identität']);
    expect(result.checkedRows).toBe(3);
  });

  it('leaves out Swiss tournaments and says that the result is incomplete', () => {
    const { league, openings } = consistent({});
    const swiss = evening('sw', '2026-05-01T18:00:00Z', { tournamentType: 'swiss', name: 'Turnier' });
    const result = checkLeague(league, [...sessions, swiss], openings);
    expect(result.unsupported).toEqual(['Turnier']);
    expect(result.ok).toBe(true);
  });

  it('checks the eternal table with the same rule (only points, points against and titles come from evenings)', () => {
    const booked = bookSessions(true, sessions);
    const rows = booked.map(b => row(b.player.name, b.player.ref, { points: b.points + 100, pointsAgainst: b.pointsAgainst + 50, championships: (b.championships ?? 0) + 5, wins: 7 }));
    const openings: OpeningLookup = new Map(booked.map(b => [b.player.ref!, { ...zero, points: 100, pointsAgainst: 50, championships: 5, wins: 7 }]));
    expect(checkLeague(leagueOf(rows, true), sessions, openings).ok).toBe(true);
    rows[0].wins = 8;
    expect(checkLeague(leagueOf(rows, true), sessions, openings).differences.map(d => d.column)).toEqual(['wins']);
  });
});

describe('openingsFor', () => {
  it('gives opening balances with which the check passes, even after a deliberate manual change', () => {
    const { league } = consistent({ Anna: { wins: 10 } });
    const ben = league.playerStats.find(s => s.player.name === 'Ben')!;
    ben.championships = (ben.championships ?? 0) + 2; // changed by hand on purpose
    league.playerStats.push(row('Dora', 'R-d', { points: 12 }));
    league.playerStats.push(row('Ohne Identität', undefined, { points: 99 }));
    const lookup: OpeningLookup = new Map(openingsFor(league, sessions).map(o => [o.ref, o.opening]));
    expect(lookup.has('R-d')).toBe(true);
    expect(lookup.size).toBe(4); // Anna, Ben, Cem, Dora; the row without identity gets none
    const result = checkLeague(league, sessions, lookup);
    expect(result).toMatchObject({ ok: true, differences: [], notChecked: ['Ohne Identität'] });
  });
});

describe('rows that moved to another player by a merge of league rows only', () => {
  // Cem's row was merged into Anna's league row, but the evenings still book Cem
  const merged = () => {
    const { league, openings } = consistent({});
    const cem = league.playerStats.find(s => s.player.name === 'Cem')!;
    const anna = league.playerStats.find(s => s.player.name === 'Anna')!;
    for (const c of Object.keys(zero) as (keyof typeof zero)[]) anna[c] = (anna[c] ?? 0) + (cem[c] ?? 0);
    league.playerStats = league.playerStats.filter(s => s !== cem);
    return { league, openings };
  };

  it('is reported as missing row and difference until it is taken over as the new state', () => {
    const { league, openings } = merged();
    const result = checkLeague(league, sessions, openings);
    expect(result.ok).toBe(false);
    expect(result.missingRows.map(m => m.name)).toEqual(['Cem']);
    expect(result.differences.length).toBeGreaterThan(0);
  });

  it('is quiet after taking over: Cem is acknowledged, Anna carries the sum, and a second take-over changes nothing', () => {
    const { league, openings } = merged();
    const taken = openingsFor(league, sessions);
    const lookup: OpeningLookup = new Map(taken.map(t => [t.ref, t.opening]));
    expect(checkLeague(league, sessions, lookup)).toMatchObject({ ok: true, differences: [], missingRows: [] });
    expect(openingsFor(league, sessions)).toEqual(taken);
    // a real change after that is still noticed
    league.playerStats.find(s => s.player.name === 'Anna')!.points += 1;
    expect(checkLeague(league, sessions, lookup).differences).toEqual([expect.objectContaining({ name: 'Anna', column: 'points' })]);
    void openings;
  });

  it('does not hide a missing row whose opening balance does not cancel the evenings', () => {
    const { league } = merged();
    const wrong: OpeningLookup = new Map([['R-c', { ...zero, points: -1 }]]);
    expect(checkLeague(league, sessions, wrong).missingRows.map(m => m.name)).toEqual(['Cem']);
  });
});
