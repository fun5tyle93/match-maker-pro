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

// The ranking-rule and sudden-death columns arrived with a migration. The app must keep working in front of it
// (a preview) and must never change the rule of an evening that was played under the old one.
type Storage = typeof import('@/lib/storage');
const { state } = fake;
const p = (id: string) => ({ id, name: `Spieler ${id}` });
const game = (id: string, suddenDeath?: boolean) => ({
  id, round: 1, homePlayer: p('p1'), awayPlayer: p('p2'), homeScore: 3, awayScore: 2, isCompleted: true, suddenDeath,
});
const evening = (over: Record<string, unknown> = {}) => ({
  id: 's-new', date: '2026-11-12T18:00:00Z', players: [p('p1'), p('p2')], matches: [game('m1')],
  isCompleted: false, roundCount: 1, matchesPerPairing: 1, ...over,
});
const sessionRow = (over: Record<string, unknown> = {}) => ({
  id: 's-old', name: null, date: '2026-10-23T18:00:00Z', is_completed: true, round_count: 1, matches_per_pairing: 1,
  transferred_to_leagues: [], tournament_type: 'training', ...over,
});
const matchRow = (over: Record<string, unknown> = {}) => ({
  id: 'm-old', session_id: 's-old', round: 1, home_player_id: 'p1', home_player_name: 'A', away_player_id: 'p2', away_player_name: 'B',
  home_score: 1, away_score: 0, is_completed: true, phase: 'swiss', playoff_round: null, match_number: null, is_bye: false,
  table_number: null, ...over,
});

let storage: Storage;
beforeEach(async () => {
  state.db = {};
  state.ops = [];
  state.failOn = null;
  vi.resetModules();
  storage = await import('@/lib/storage');
});

const savedSession = (id: string) => state.db.training_sessions.find(r => r.id === id)!;
const savedMatch = (id: string) => state.db.matches.find(r => r.id === id)!;

describe('in front of the migration (columns unknown)', () => {
  it('writes neither ranking_rule, decider_results nor sudden_death, and a new evening gets the old rule', async () => {
    expect(storage.defaultRankingRule()).toBe('legacy');
    await storage.saveToHistory(evening({ rankingRule: 'dtkv2026', deciderResults: [{ players: ['a', 'b'], order: ['b', 'a'] }], matches: [game('m1', true)] }) as never);
    expect(Object.keys(savedSession('s-new'))).not.toContain('ranking_rule');
    expect(Object.keys(savedSession('s-new'))).not.toContain('decider_results');
    expect(Object.keys(savedMatch('m1'))).not.toContain('sudden_death');
  });

  it('an evening read without the column is an old evening', async () => {
    state.db.training_sessions = [sessionRow()];
    state.db.training_players = [];
    state.db.matches = [matchRow()];
    const [loaded] = await storage.loadHistory();
    expect(loaded.rankingRule).toBe('legacy');
    expect(storage.defaultRankingRule()).toBe('legacy');
  });
});

describe('after the migration (columns present in what was read)', () => {
  const migrated = () => {
    state.db.training_sessions = [sessionRow({ ranking_rule: 'legacy', decider_results: null })];
    state.db.training_players = [];
    state.db.matches = [matchRow({ sudden_death: false })];
  };

  it('new evenings get the DTKV rule and it is written', async () => {
    migrated();
    await storage.loadHistory();
    expect(storage.defaultRankingRule()).toBe('dtkv2026');
    await storage.saveToHistory(evening({ rankingRule: storage.defaultRankingRule() }) as never);
    expect(savedSession('s-new').ranking_rule).toBe('dtkv2026');
  });

  it('an old evening that is edited and saved again keeps its rule', async () => {
    migrated();
    const [old] = await storage.loadHistory();
    expect(old.rankingRule).toBe('legacy');
    await storage.saveToHistory({ ...old, matches: old.matches.map(m => ({ ...m, homeScore: 5 })) });
    expect(savedSession('s-old').ranking_rule).toBe('legacy');
  });

  it('an evening without a rule that is saved is written as old, never as new', async () => {
    migrated();
    await storage.loadHistory();
    await storage.saveToHistory(evening() as never);   // rankingRule undefined
    expect(savedSession('s-new').ranking_rule).toBe('legacy');
  });

  it('the results of a decider and the sudden-death flag round-trip', async () => {
    migrated();
    await storage.loadHistory();
    const deciders = [{ players: ['p1', 'p2'], order: ['p2', 'p1'] }];
    await storage.saveToHistory(evening({ rankingRule: 'dtkv2026', deciderResults: deciders, matches: [game('m1', true), game('m2', false)] }) as never);
    expect(savedSession('s-new').decider_results).toEqual(deciders);
    expect(savedMatch('m1').sudden_death).toBe(true);
    expect(savedMatch('m2').sudden_death).toBe(false);
    state.db.training_sessions.find(r => r.id === 's-new')!.is_completed = true;
    const loaded = (await storage.loadHistory()).find(s => s.id === 's-new')!;
    expect(loaded.rankingRule).toBe('dtkv2026');
    expect(loaded.deciderResults).toEqual(deciders);
    expect(loaded.matches.find(m => m.id === 'm1')?.suddenDeath).toBe(true);
  });

  it('only the columns that were seen are written (sudden_death needs its own sign)', async () => {
    state.db.training_sessions = [sessionRow({ ranking_rule: 'legacy' })];
    state.db.training_players = [];
    state.db.matches = [matchRow()];   // matches without sudden_death
    await storage.loadHistory();
    await storage.saveToHistory(evening({ rankingRule: 'dtkv2026', matches: [game('m1', true)] }) as never);
    expect(savedSession('s-new').ranking_rule).toBe('dtkv2026');
    expect(Object.keys(savedMatch('m1'))).not.toContain('sudden_death');
  });
});
