import { beforeEach, describe, expect, it, vi } from 'vitest';

// Small in-memory stand-in for Supabase that records every operation and can fail on demand
const fake = vi.hoisted(() => {
  type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const state = {
    db: {} as Record<string, Row[]>,
    ops: [] as string[],
    failOn: null as null | ((mode: string, table: string) => boolean),
    missingColumns: [] as string[],
    probeError: null as null | { code?: string; message: string },
  };

  function builder(table: string) {
    let mode = 'select';
    let payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let range: [number, number] | null = null;
    let single = false;
    let limitTo: number | null = null;
    let selectedColumns = '*';
    let orderBy: { col: string; asc: boolean } | null = null;
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
      if (mode === 'select' && selectedColumns !== '*') {
        if (state.probeError) return { data: null, error: state.probeError };
        const missing = selectedColumns.split(',').map(c => c.trim()).find(c => state.missingColumns.includes(c));
        if (missing) return { data: null, error: { code: '42703', message: `column training_sessions.${missing} does not exist` } };
      }
      if (state.failOn?.(mode, table)) return { data: null, error: { message: `injected failure: ${label}` } };

      state.db[table] = state.db[table] ?? [];
      if (mode === 'select') {
        let rows = matching();
        if (orderBy) { const { col, asc } = orderBy; rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1)); }
        if (range) rows = rows.slice(range[0], range[1] + 1);
        if (limitTo !== null) rows = rows.slice(0, limitTo);
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
      select: (cols?: string) => ((selectedColumns = cols ?? '*'), api),
      not: (k: string, _op: string, v: unknown) => (filters.push(r => r[k] !== v && r[k] !== undefined), api),
      limit: (n: number) => ((limitTo = n), api),
      eq: (k: string, v: unknown) => (filters.push(r => r[k] === v), api),
      in: (k: string, vs: unknown[]) => (filters.push(r => vs.includes(r[k])), api),
      order: (col?: string, opts?: { ascending?: boolean }) => ((orderBy = col ? { col, asc: opts?.ascending !== false } : null), api),
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

import { toPlayoffMatches } from '@/lib/tournamentPhases';
type Storage = typeof import('@/lib/storage');
const { state } = fake;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const p = (n: number) => ({ id: uuid(n), name: `Spieler ${n}` });
const swissState = (id: string, over: Record<string, unknown> = {}) => ({
  id, date: '2026-11-13T18:00:00Z', config: { rounds: 3, refereeMode: false, endMode: 'direct' }, players: [p(1), p(2)], rounds: [],
  currentRound: 0, isCompleted: false, ...over,
});
const asSession = (id: string, over: Record<string, unknown> = {}) => ({
  id, date: '2026-11-13T18:00:00Z', players: [p(1), p(2)], matches: [], isCompleted: false, roundCount: 3, matchesPerPairing: 1,
  tournamentType: 'swiss' as const, ...over,
});

let storage: Storage;
beforeEach(async () => {
  state.db = { training_sessions: [], training_players: [], matches: [] };
  state.ops = [];
  state.failOn = null;
  state.missingColumns = [];
  state.probeError = null;
  vi.resetModules();
  storage = await import('@/lib/storage');
});

const sessionRow = (id: string) => state.db.training_sessions.find(r => r.id === id)!;

describe('swissStateSupported', () => {
  it('is false when the column does not exist, and a Swiss tournament is then saved without its state', async () => {
    state.missingColumns = ['swiss_state'];
    expect(await storage.swissStateSupported()).toBe(false);
    await storage.saveSwissSession(asSession(uuid(100)) as never, swissState(uuid(100)) as never);
    expect(Object.keys(sessionRow(uuid(100)))).not.toContain('swiss_state');
  });

  it('is true when the column exists, even when no row has it yet, and the state is then written', async () => {
    expect(await storage.swissStateSupported()).toBe(true);
    await storage.saveSwissSession(asSession(uuid(100)) as never, swissState(uuid(100), { currentRound: 2 }) as never);
    expect(sessionRow(uuid(100)).swiss_state).toMatchObject({ id: uuid(100), currentRound: 2 });
  });

  it('a connection problem is an error, not "no column", and it is not remembered', async () => {
    state.probeError = { message: 'FetchError: network down' };
    await expect(storage.swissStateSupported()).rejects.toBeTruthy();
    state.probeError = null;
    expect(await storage.swissStateSupported()).toBe(true);   // asked again
  });

  it('remembers a definite answer', async () => {
    await storage.swissStateSupported();
    const probes = () => state.ops.filter(o => o === 'select:training_sessions').length;
    const before = probes();
    await storage.swissStateSupported();
    expect(probes()).toBe(before);
  });
});

describe('running Swiss tournament', () => {
  it('a later save of the finished evening or of a training evening leaves the stored state alone', async () => {
    await storage.swissStateSupported();
    await storage.saveSwissSession(asSession(uuid(100)) as never, swissState(uuid(100), { currentRound: 2 }) as never);
    await storage.saveToHistory(asSession(uuid(100), { isCompleted: true }) as never);
    expect(sessionRow(uuid(100)).is_completed).toBe(true);
    expect(sessionRow(uuid(100)).swiss_state).toMatchObject({ currentRound: 2 });   // untouched
    await storage.saveToHistory(asSession(uuid(101), { tournamentType: 'training' }) as never);
    expect(Object.keys(sessionRow(uuid(101)))).not.toContain('swiss_state');
  });

  it('loadRunningSwissSession returns the newest running tournament with a state, and nothing else', async () => {
    await storage.swissStateSupported();
    state.db.training_sessions = [
      { id: uuid(1), date: '2026-11-01T10:00:00Z', is_completed: false, tournament_type: 'swiss', swiss_state: swissState(uuid(1)) },
      { id: uuid(2), date: '2026-11-10T10:00:00Z', is_completed: false, tournament_type: 'swiss', swiss_state: swissState(uuid(2)) },
      { id: uuid(3), date: '2026-11-12T10:00:00Z', is_completed: true, tournament_type: 'swiss', swiss_state: swissState(uuid(3)) },
      { id: uuid(4), date: '2026-11-13T10:00:00Z', is_completed: false, tournament_type: 'training', swiss_state: null },
      { id: uuid(5), date: '2026-11-13T11:00:00Z', is_completed: false, tournament_type: 'swiss', swiss_state: null },
    ];
    expect((await storage.loadRunningSwissSession())?.id).toBe(uuid(2));
  });

  it('returns null when nothing is running', async () => {
    await storage.swissStateSupported();
    expect(await storage.loadRunningSwissSession()).toBeNull();
  });

  it('discarding takes the tournament off the running slot but deletes nothing', async () => {
    await storage.swissStateSupported();
    const match = { id: uuid(500), round: 1, homePlayer: p(1), awayPlayer: p(2), homeScore: 2, awayScore: 1, isCompleted: true };
    await storage.saveSwissSession(asSession(uuid(100), { matches: [match] }) as never, swissState(uuid(100)) as never);
    await storage.discardSwissSession(uuid(100));
    expect(sessionRow(uuid(100)).swiss_state).toBeNull();
    expect(state.db.matches).toHaveLength(1);
    expect(state.db.training_players).toHaveLength(2);
    expect(await storage.loadRunningSwissSession()).toBeNull();
  });
});

describe('empty slots of the playoff bracket and byes', () => {
  it('are stored with a valid uuid and the name "–", and read back as empty slots', async () => {
    await storage.swissStateSupported();
    const matchId = uuid(900);
    const slot = { id: `null-h-${matchId}`, name: '–' };
    const final = {
      id: matchId, round: 5, homePlayer: slot, awayPlayer: { id: `null-a-${matchId}`, name: '–' },
      homeScore: null, awayScore: null, isCompleted: false, phase: 'playoff' as const, playoffRound: 1, matchNumber: 1,
    };
    const bye = { id: uuid(901), round: 4, homePlayer: p(1), awayPlayer: { id: `null-a-${uuid(901)}`, name: '–' }, homeScore: null, awayScore: null, isCompleted: true, phase: 'playoff' as const, playoffRound: 2, matchNumber: 1, isBye: true };
    await storage.saveSwissSession(asSession(uuid(100), { matches: [final, bye] }) as never, swissState(uuid(100)) as never);
    const stored = state.db.matches;
    expect(stored).toHaveLength(2);
    stored.forEach(row => {
      [row.home_player_id, row.away_player_id].forEach(id => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/));
      expect(String(row.home_player_id).startsWith('null-')).toBe(false);
    });
    expect(stored.find(r => r.id === matchId)).toMatchObject({ home_player_name: '–', away_player_name: '–' });
    expect(stored.find(r => r.id === uuid(901))).toMatchObject({ home_player_id: p(1).id, away_player_name: '–' });
    // the same slot always gets the same stored id, so saving again does not churn the row
    await storage.saveSwissSession(asSession(uuid(100), { matches: [final, bye] }) as never, swissState(uuid(100)) as never);
    expect(state.db.matches.find(r => r.id === matchId)).toMatchObject({ home_player_id: stored.find(r => r.id === matchId)!.home_player_id });

    // read back (mark the evening completed so that the history lists it)
    sessionRow(uuid(100)).is_completed = true;
    const [loaded] = await storage.loadHistory();
    const bracket = toPlayoffMatches(loaded.matches);
    expect(bracket.find(m => m.id === matchId)).toMatchObject({ homePlayer: null, awayPlayer: null });
    expect(bracket.find(m => m.id === uuid(901))).toMatchObject({ isBye: true, awayPlayer: null });
  });
});
