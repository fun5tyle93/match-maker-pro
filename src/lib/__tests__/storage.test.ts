import { beforeEach, describe, expect, it, vi } from 'vitest';

// Small in-memory stand-in for Supabase that records every operation and can fail on demand
const fake = vi.hoisted(() => {
  type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const state = {
    db: {} as Record<string, Row[]>,
    ops: [] as string[],
    failOn: null as null | ((mode: string, table: string) => boolean),
  };

  function builder(table: string) {
    let mode = 'select';
    let payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let range: [number, number] | null = null;
    let single = false;
    const filters: Array<(r: Row) => boolean> = [];

    const matching = () => (state.db[table] ?? []).filter(r => filters.every(f => f(r)));

    const exec = () => {
      const label = [
        mode,
        table,
        mode === 'upsert' && !Array.isArray(payload) ? payload.id : '',
        mode === 'update' ? payload.session_id : '',
      ]
        .filter(v => v !== '' && v !== undefined)
        .join(':');
      state.ops.push(label);
      if (state.failOn?.(mode, table)) return { data: null, error: { message: `injected failure: ${label}` } };

      state.db[table] = state.db[table] ?? [];
      if (mode === 'select') {
        let rows = matching();
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return { data: single ? rows[0] ?? null : rows.map(r => ({ ...r })), error: null };
      }
      if (mode === 'delete') {
        const doomed = new Set(matching());
        state.db[table] = state.db[table].filter(r => !doomed.has(r));
      } else if (mode === 'update') {
        matching().forEach(r => Object.assign(r, payload));
      } else {
        const rows: Row[] = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          const existing = mode === 'upsert' ? state.db[table].find(r => r.id === row.id) : undefined;
          if (existing) Object.assign(existing, row);
          else state.db[table].push({ id: `gen-${state.db[table].length + 1}`, ...row });
        }
      }
      return { data: null, error: null };
    };

    const api: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      select: () => api,
      eq: (k: string, v: unknown) => (filters.push(r => r[k] === v), api),
      in: (k: string, vs: unknown[]) => (filters.push(r => vs.includes(r[k])), api),
      order: () => api,
      range: (a: number, b: number) => ((range = [a, b]), api),
      maybeSingle: () => ((single = true), api),
      delete: () => ((mode = 'delete'), api),
      update: (p: unknown) => ((mode = 'update'), (payload = p), api),
      insert: (p: unknown) => ((mode = 'insert'), (payload = p), api),
      upsert: (p: unknown) => ((mode = 'upsert'), (payload = p), api),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve().then(exec).then(resolve, reject),
    };
    return api;
  }

  return { state, supabase: { from: (table: string) => builder(table) } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: fake.supabase }));

import {
  deleteLeague,
  loadCurrentSession,
  loadLeagues,
  saveCurrentSession,
  saveLeague,
  saveToHistory,
} from '@/lib/storage';
import { League, PlayerStats, TrainingSession } from '@/types';

const { state } = fake;
const p = (id: string) => ({ id, name: `Spieler ${id}` });
const match = (id: string, home: string, away: string, homeScore: number | null = null) => ({
  id,
  round: 1,
  homePlayer: p(home),
  awayPlayer: p(away),
  homeScore,
  awayScore: homeScore === null ? null : 0,
  isCompleted: homeScore !== null,
});
const session = (over: Partial<TrainingSession> = {}): TrainingSession => ({
  id: 's1',
  date: '2026-10-23T18:00:00Z',
  players: [p('p1'), p('p2')],
  matches: [match('m1', 'p1', 'p2', 3), match('m2', 'p2', 'p1')],
  isCompleted: false,
  roundCount: 2,
  matchesPerPairing: 1,
  ...over,
});
const stat = (id: string, points: number): PlayerStats => ({
  player: p(id),
  wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
  points, pointsAgainst: 0, goalDifference: 0, championships: 0, viceChampionships: 0,
});

const seedEvening = () => {
  state.db = {
    training_sessions: [{ id: 's1', is_completed: false }],
    training_players: [
      { id: 'tp1', session_id: 's1', player_id: 'p1', player_name: 'Spieler p1' },
      { id: 'tp3', session_id: 's1', player_id: 'p3', player_name: 'Spieler p3' },
    ],
    matches: [
      { id: 'm1', session_id: 's1', home_score: null },
      { id: 'm_old', session_id: 's1', home_score: null },
    ],
    current_session: [{ id: 1, session_id: null }],
  };
};

beforeEach(() => {
  state.ops = [];
  state.failOn = null;
  seedEvening();
});

describe('saving an evening', () => {
  it('updates rows in place and removes only rows that are gone', async () => {
    await saveToHistory(session());

    expect(state.db.matches.map(m => m.id).sort()).toEqual(['m1', 'm2']);
    expect(state.db.matches.find(m => m.id === 'm1')?.home_score).toBe(3);
    expect(state.db.training_players.map(r => r.player_id).sort()).toEqual(['p1', 'p2']);
    // the existing player row was kept, not recreated
    expect(state.db.training_players.find(r => r.player_id === 'p1')?.id).toBe('tp1');
  });

  it('removes old rows only after the new rows were written', async () => {
    await saveToHistory(session());
    const lastWrite = state.ops.lastIndexOf('upsert:matches');
    const firstDelete = state.ops.indexOf('delete:matches');
    expect(lastWrite).toBeGreaterThan(-1);
    expect(firstDelete).toBeGreaterThan(lastWrite);
  });

  it('does not delete anything when writing the matches fails', async () => {
    state.failOn = (mode, table) => mode === 'upsert' && table === 'matches';
    await expect(saveToHistory(session())).rejects.toBeTruthy();

    expect(state.ops.some(o => o.startsWith('delete:'))).toBe(false);
    expect(state.db.matches.map(m => m.id).sort()).toEqual(['m1', 'm_old']);
    // adding is harmless; what existed before must still be there
    expect(state.db.training_players.map(r => r.player_id)).toEqual(expect.arrayContaining(['p1', 'p3']));
  });

  it('reports an error instead of pretending success when the session row fails', async () => {
    state.failOn = (mode, table) => mode === 'upsert' && table === 'training_sessions';
    await expect(saveToHistory(session())).rejects.toBeTruthy();
    expect(state.ops).toEqual(['upsert:training_sessions:s1']);
  });

  it('runs overlapping saves one after another', async () => {
    const a = saveCurrentSession(session({ id: 'A' }));
    const b = saveCurrentSession(session({ id: 'B' }));
    await Promise.all([a, b]);

    const lastOfA = state.ops.lastIndexOf('update:current_session:A');
    const firstOfB = state.ops.indexOf('upsert:training_sessions:B');
    expect(lastOfA).toBeGreaterThan(-1);
    expect(firstOfB).toBeGreaterThan(lastOfA);
  });

  it('keeps working after one save failed', async () => {
    state.failOn = () => true;
    await expect(saveToHistory(session())).rejects.toBeTruthy();
    state.failOn = null;
    await expect(saveToHistory(session())).resolves.toBeUndefined();
  });
});

describe('loading', () => {
  it('loadCurrentSession throws on a database error instead of returning "no evening"', async () => {
    state.failOn = (mode, table) => mode === 'select' && table === 'current_session';
    await expect(loadCurrentSession()).rejects.toBeTruthy();
  });

  it('loadLeagues throws on a database error instead of returning an empty list', async () => {
    state.failOn = (mode, table) => mode === 'select' && table === 'leagues';
    await expect(loadLeagues()).rejects.toBeTruthy();
  });
});

describe('saving leagues', () => {
  const league = (stats: PlayerStats[], id = 'L1'): League => ({
    id,
    name: `Liga ${id}`,
    year: 2026,
    playerStats: stats,
    createdAt: '2026-01-01T00:00:00Z',
  });

  const seedLeagues = () => {
    state.db = {
      leagues: [
        { id: 'L1', name: 'Liga L1', year: 2026, created_at: '2026-01-01T00:00:00Z' },
        { id: 'L2', name: 'Liga L2', year: 2026, created_at: '2026-01-02T00:00:00Z' },
      ],
      player_stats: [
        { id: 'r1', league_id: 'L1', player_id: 'p1', player_name: 'Spieler p1', points: 4 },
        { id: 'r2', league_id: 'L1', player_id: 'p2', player_name: 'Spieler p2', points: 2 },
        { id: 'r3', league_id: 'L2', player_id: 'p1', player_name: 'Spieler p1', points: 9 },
      ],
    };
    state.ops = [];
  };

  it('updates stats in place, adds new players and removes dropped ones', async () => {
    seedLeagues();
    await saveLeague(league([stat('p1', 6), stat('p3', 1)]));

    const rows = state.db.player_stats.filter(r => r.league_id === 'L1');
    expect(rows.map(r => r.player_id).sort()).toEqual(['p1', 'p3']);
    expect(rows.find(r => r.player_id === 'p1')).toMatchObject({ id: 'r1', points: 6 });
  });

  it('never touches other leagues', async () => {
    seedLeagues();
    await saveLeague(league([stat('p1', 6)]));
    expect(state.db.leagues.map(l => l.id).sort()).toEqual(['L1', 'L2']);
    expect(state.db.player_stats.find(r => r.id === 'r3')?.points).toBe(9);
    expect(state.ops.some(o => o.startsWith('delete:leagues'))).toBe(false);
  });

  it('keeps every row when writing the stats fails', async () => {
    seedLeagues();
    state.failOn = (mode, table) => mode === 'upsert' && table === 'player_stats';
    await expect(saveLeague(league([stat('p1', 6)]))).rejects.toBeTruthy();

    expect(state.ops.some(o => o.startsWith('delete:'))).toBe(false);
    expect(state.db.player_stats.map(r => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(state.db.player_stats.find(r => r.id === 'r1')?.points).toBe(4);
  });

  it('deleteLeague removes exactly one league and reports errors', async () => {
    seedLeagues();
    await deleteLeague('L2');
    expect(state.db.leagues.map(l => l.id)).toEqual(['L1']);

    state.failOn = () => true;
    await expect(deleteLeague('L1')).rejects.toBeTruthy();
  });
});
