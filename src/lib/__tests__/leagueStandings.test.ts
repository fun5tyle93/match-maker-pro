import { describe, expect, it } from 'vitest';
import { bookSessions, openingBalances, sessionResult } from '@/lib/leagueStandings';
import { Match, PlayerStats, TrainingSession } from '@/types';

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
const stat = (name: string, ref: string | undefined, v: Partial<PlayerStats>): PlayerStats => ({
  player: player(name, ref), wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, pointsAgainst: 0,
  goalDifference: 0, championships: 0, viceChampionships: 0, ...v,
});
const by = (list: PlayerStats[], name: string) => list.find(s => s.player.name === name)!;

describe('sessionResult', () => {
  it('gives everybody\'s numbers, the winner and the runner-up', () => {
    const r = sessionResult(evening('e1', '2026-03-01T18:00:00Z'));
    expect(r.firstPlace).toBe('Anna');
    expect(r.secondPlace).toBe('Ben');
    expect(by(r.stats, 'Anna')).toMatchObject({ wins: 2, points: 4, goalsFor: 5, goalsAgainst: 1 });
  });

  it('gives the titles of a player out of competition to the next players', () => {
    const base = evening('ak', '2026-03-01T18:00:00Z');
    const renamed = (name: string) => (p: { id: string; name: string; ref?: string }) => (p.name === 'Anna' ? { ...p, name } : p);
    const session: TrainingSession = {
      ...base,
      players: base.players.map(renamed('Anna a.K.')),
      matches: base.matches.map(m => ({ ...m, homePlayer: renamed('Anna a.K.')(m.homePlayer), awayPlayer: renamed('Anna a.K.')(m.awayPlayer) })),
    };
    const r = sessionResult(session);
    expect(r.firstPlace).toBe('Ben');
    expect(r.secondPlace).toBe('Cem');
    // the player out of competition still gets the games, points and goals
    expect(by(r.stats, 'Anna a.K.')).toMatchObject({ wins: 2, points: 4 });
    const booked = bookSessions(false, [session]);
    expect(by(booked, 'Anna a.K.')).toMatchObject({ championships: 0, viceChampionships: 0, points: 4 });
    expect(by(booked, 'Ben').championships).toBe(1);
  });

  it('books a Swiss tournament with the numbers and titles of its final result', () => {
    // A wins all three games (3-0-0, goals 7:1), C and B are level on points, D loses all; no playoff
    const group = (id: string, round: number, home: string, away: string, hs: number, as: number) => ({
      id, round, phase: 'swiss' as const, homePlayer: { id: home, name: `Spieler ${home}` }, awayPlayer: { id: away, name: `Spieler ${away}` },
      homeScore: hs, awayScore: as, isCompleted: true,
    });
    const swiss = evening('s', '2026-03-01T18:00:00Z', {
      tournamentType: 'swiss',
      players: ['A', 'B', 'C', 'D'].map(id => ({ id, name: `Spieler ${id}` })),
      matches: [
        group('g1', 1, 'A', 'B', 3, 0), group('g2', 1, 'C', 'D', 1, 0), group('g3', 2, 'A', 'C', 2, 0),
        group('g4', 2, 'B', 'D', 1, 0), group('g5', 3, 'A', 'D', 2, 1), group('g6', 3, 'B', 'C', 0, 0),
      ],
    });
    const result = sessionResult(swiss);
    expect(result.stats.map(r => [r.player.id, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.points, r.pointsAgainst, r.goalDifference].join(',')))
      .toEqual(['A,3,0,0,7,1,6,0,6', 'C,1,1,1,1,2,3,3,-1', 'B,1,1,1,1,3,3,3,-2', 'D,0,0,3,1,4,0,6,-3']);
    expect([result.firstPlace, result.secondPlace]).toEqual(['Spieler A', 'Spieler C']);
  });
});

describe('bookSessions', () => {
  const sessions = [evening('e2', '2026-04-01T18:00:00Z'), evening('e1', '2026-03-01T18:00:00Z')];

  it('adds the evenings up like the transfer does, in an annual league', () => {
    const booked = bookSessions(false, sessions);
    expect(by(booked, 'Anna')).toMatchObject({ wins: 4, points: 8, goalsFor: 10, championships: 2, viceChampionships: 0 });
    expect(by(booked, 'Ben')).toMatchObject({ wins: 0, draws: 2, losses: 2, viceChampionships: 2 });
  });

  it('books only points, points against and championships in the eternal table', () => {
    const booked = bookSessions(true, sessions);
    expect(by(booked, 'Anna')).toMatchObject({ wins: 0, goalsFor: 0, points: 8, championships: 2, viceChampionships: 0 });
    expect(by(booked, 'Ben')).toMatchObject({ viceChampionships: 0, pointsAgainst: 6 });
  });

  it('books the oldest evening first whatever the order of the list, so level rows come out in the same order', () => {
    const rename = (e: TrainingSession, names: string[]): TrainingSession => {
      const swap = (p: { id: string; name: string; ref?: string }, i: number) => ({ id: `${e.id}-${i}`, name: names[i], ref: `${e.id}-ref-${i}` });
      const players = e.players.map(swap);
      const at = (name: string) => players[e.players.findIndex(p => p.name === name)];
      return { ...e, players, matches: e.matches.map(m => ({ ...m, homePlayer: at(m.homePlayer.name), awayPlayer: at(m.awayPlayer.name) })) };
    };
    const old = rename(evening('old', '2026-03-01T18:00:00Z'), ['Anna', 'Ben', 'Cem']);
    const recent = rename(evening('new', '2026-05-01T18:00:00Z'), ['Dora', 'Emil', 'Finn']);
    const names = (list: PlayerStats[]) => list.map(s => s.player.name);
    expect(names(bookSessions(false, [recent, old]))).toEqual(names(bookSessions(false, [old, recent])));
    expect(names(bookSessions(false, [recent, old]))[0]).toBe('Anna');
  });

  it('is empty without evenings', () => {
    expect(bookSessions(false, [])).toEqual([]);
  });
});

describe('openingBalances', () => {
  const booked = bookSessions(false, [evening('e1', '2026-03-01T18:00:00Z')]);

  it('is the stored row minus what the evenings contributed', () => {
    const stored = [stat('Anna', 'R-a', { wins: 5, points: 10, pointsAgainst: 2, goalsFor: 20, goalsAgainst: 5, goalDifference: 15, championships: 3 })];
    const { rows, negatives } = openingBalances(stored, booked.filter(b => b.player.name === 'Anna'));
    expect(rows[0].opening).toMatchObject({ wins: 3, points: 6, pointsAgainst: 2, goalsFor: 15, goalsAgainst: 4, goalDifference: 11, championships: 2 });
    expect(negatives).toEqual([]);
  });

  it('flags a title that an evening gave but the league does not hold, and keeps the value', () => {
    const stored = [stat('Anna', 'R-a', { wins: 1, points: 2, championships: 0 })];
    const { rows, negatives } = openingBalances(stored, booked.filter(b => b.player.name === 'Anna'));
    expect(negatives.map(x => `${x.name}:${x.column}:${x.value}`)).toContain('Anna:championships:-1');
    expect(negatives.map(x => x.column)).toContain('wins');
    expect(rows[0].opening.championships).toBe(-1);
  });

  it('does not flag a negative goal difference (it may be negative)', () => {
    // Ben's evening: 2 goals for, 4 against = -2; stored -5, so the opening balance is -3
    const stored = [stat('Ben', 'R-b', { wins: 0, draws: 1, losses: 1, points: 1, pointsAgainst: 3, goalsFor: 2, goalsAgainst: 7, goalDifference: -5 })];
    const { rows, negatives } = openingBalances(stored, booked.filter(b => b.player.name === 'Ben'));
    expect(rows[0].opening.goalDifference).toBe(-3);
    expect(negatives.some(x => x.column === 'goalDifference')).toBe(false);
  });

  it('lists a player whom evenings booked but who has no row in the league, with negative values', () => {
    const { rows, negatives } = openingBalances([], booked.filter(b => b.player.name === 'Cem'));
    expect(rows[0].stored).toBeUndefined();
    expect(negatives.length).toBeGreaterThan(0);
  });

  it('matches by the fixed identity, so a different spelling is the same person', () => {
    const stored = [stat('Anna Berg', 'R-a', { wins: 2, points: 4, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, championships: 1 })];
    const { rows, negatives } = openingBalances(stored, booked.filter(b => b.player.name === 'Anna'));
    expect(rows.length).toBe(1);
    expect(rows[0].opening.wins).toBe(0);
    expect(negatives).toEqual([]);
  });

  it('keeps two people with the same name apart when their identities differ', () => {
    const stored = [stat('Anna', 'R-other', { wins: 9, points: 18 })];
    const { rows } = openingBalances(stored, booked.filter(b => b.player.name === 'Anna'));
    expect(rows.length).toBe(2); // the stored Anna and the Anna of the evening (no row)
    expect(rows.find(r => r.stored)!.opening.wins).toBe(9);
  });

  it('matches a row without identity by name, and a name twice goes to the row with the most points', () => {
    const stored = [stat('Anna', undefined, { wins: 3, points: 6 }), stat('anna', undefined, { wins: 100, points: 200 })];
    const { rows } = openingBalances(stored, booked.filter(b => b.player.name === 'Anna'));
    const big = rows.find(r => r.stored?.points === 200)!;
    const small = rows.find(r => r.stored?.points === 6)!;
    expect(big.contribution.wins).toBe(2);
    expect(small.contribution.wins).toBe(0);
  });
});
