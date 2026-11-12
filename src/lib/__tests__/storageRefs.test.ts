import { beforeEach, describe, expect, it, vi } from 'vitest';

// Small in-memory stand-in for Supabase that records every operation and can fail on demand
const fake = vi.hoisted(() => {
  type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const state = {
    db: {} as Record<string, Row[]>,
    ops: [] as string[],
    failOn: null as null | ((mode: string, table: string) => boolean | { code?: string; message: string }),
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
      const failure = state.failOn?.(mode, table);
      if (failure) return { data: null, error: typeof failure === 'object' ? failure : { message: `injected failure: ${label}` } };

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
        let rows: Row[] = Array.isArray(payload) ? payload : [payload];
        // Like PostgREST: the columns of a batch are the keys of all its rows, a row without one of them gets null
        if (mode === 'upsert' && rows.length > 1) {
          const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
          rows = rows.map(r => Object.fromEntries(columns.map(c => [c, r[c] ?? null])));
        }
        for (const row of rows) {
          // An upsert merges by primary key: id, or (league_id, player_ref) for the opening balances
          const keyOf = (r: Row) => (r.id !== undefined ? `id:${r.id}` : r.league_id !== undefined && r.player_ref !== undefined ? `${r.league_id}|${r.player_ref}` : undefined);
          const existing = mode === 'upsert' && keyOf(row) !== undefined ? state.db[table].find(r => keyOf(r) === keyOf(row)) : undefined;
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

const { state } = fake;

// The storage module remembers whether the database has the player_ref columns, so tests that depend on that
// load a fresh copy of it.
async function freshStorage() {
  vi.resetModules();
  return import('@/lib/storage');
}

const SESSION = 's1';
const seed = (withColumns: boolean) => {
  const ref = (v: string | null) => (withColumns ? { player_ref: v } : {});
  state.db = {
    training_sessions: [{ id: SESSION, name: null, date: '2026-11-06T18:00:00Z', is_completed: false, round_count: 1, matches_per_pairing: 1, transferred_to_leagues: [], tournament_type: 'training' }],
    training_players: [
      { id: 'tp1', session_id: SESSION, player_id: 'p1', player_name: 'Erik', ...ref('R-erik') },
      { id: 'tp2', session_id: SESSION, player_id: 'p2', player_name: 'Ben', ...ref(null) },
    ],
    matches: [{
      id: 'm1', session_id: SESSION, round: 1, home_player_id: 'p1', home_player_name: 'Erik', away_player_id: 'p2', away_player_name: 'Ben',
      home_score: 3, away_score: 1, is_completed: true, phase: 'swiss',
      ...(withColumns ? { home_player_ref: 'R-erik', away_player_ref: null } : {}),
    }],
    leagues: [{ id: 'L1', name: 'Liga', year: 2026, created_at: '2026-01-01T00:00:00Z', is_eternal: false }],
    player_stats: [
      { id: 'ps1', league_id: 'L1', player_id: 'p1', player_name: 'Erik Schwarz', wins: 1, draws: 0, losses: 0, goals_for: 3, goals_against: 1, points: 2, points_against: 0, goal_difference: 2, championships: 0, vice_championships: 0, ...ref('R-erik') },
    ],
    current_session: [{ id: 1, session_id: SESSION }],
    players: [{ id: 'R-erik', display_name: 'Erik Schwarz' }, { id: 'R-ben', display_name: 'Ben' }],
    player_aliases: [{ alias: 'erik', player_id: 'R-erik' }],
  };
};

beforeEach(() => {
  state.ops = [];
  state.failOn = null;
});

const p = (id: string, name: string, ref?: string) => ({ id, name, ...(ref ? { ref } : {}) });
const session = (players: ReturnType<typeof p>[], over: Record<string, unknown> = {}) => ({
  id: SESSION, date: '2026-11-06T18:00:00Z', isCompleted: false, roundCount: 1, matchesPerPairing: 1,
  players,
  matches: [{ id: 'm1', round: 1, homePlayer: players[0], awayPlayer: players[1], homeScore: 3, awayScore: 1, isCompleted: true }],
  ...over,
});

describe('reading the fixed identity', () => {
  it('gives players, matches and league rows their identity', async () => {
    seed(true);
    const storage = await freshStorage();
    const loaded = await storage.loadCurrentSession();
    expect(loaded!.players).toEqual([{ id: 'p1', name: 'Erik', ref: 'R-erik' }, { id: 'p2', name: 'Ben' }]);
    expect(loaded!.matches[0].homePlayer.ref).toBe('R-erik');
    expect(loaded!.matches[0].awayPlayer.ref).toBeUndefined();
    const leagues = await storage.loadLeagues();
    expect(leagues[0].playerStats[0].player.ref).toBe('R-erik');
  });

  it('works on a database without the columns: no identity, nothing breaks', async () => {
    seed(false);
    const storage = await freshStorage();
    const loaded = await storage.loadCurrentSession();
    expect(loaded!.players.every(x => x.ref === undefined)).toBe(true);
  });
});

describe('writing the fixed identity', () => {
  it('writes the identity of players and matches once the database is known to have the columns', async () => {
    seed(true);
    const storage = await freshStorage();
    await storage.loadCurrentSession(); // reading rows with the column tells the app it exists
    state.db.training_players = [];
    state.db.matches = [];
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')]));
    expect(state.db.training_players.map(r => `${r.player_name}:${r.player_ref}`).sort()).toEqual(['Ben:R-ben', 'Erik:R-erik']);
    expect(state.db.matches[0]).toMatchObject({ home_player_ref: 'R-erik', away_player_ref: 'R-ben' });
  });

  it('never writes an identity before the database is known to have the columns', async () => {
    seed(false);
    const storage = await freshStorage();
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')]));
    expect(state.db.training_players.some(r => 'player_ref' in r)).toBe(false);
    expect('home_player_ref' in state.db.matches[0]).toBe(false);
  });

  it('keeps a stored identity when the app saves players that do not know it (never writes an empty one)', async () => {
    seed(true);
    const storage = await freshStorage();
    await storage.loadCurrentSession();
    // the same evening saved by a state without identities, plus one new player without identity
    await storage.saveToHistory(session([p('p1', 'Erik'), p('p2', 'Ben'), p('p3', 'Cem')]));
    expect(state.db.training_players.find(r => r.player_id === 'p1')!.player_ref).toBe('R-erik');
    expect(state.db.matches[0].home_player_ref).toBe('R-erik');
    const cem = state.db.training_players.find(r => r.player_id === 'p3')!;
    expect('player_ref' in cem).toBe(false);
  });

  it('adds the identity to a stored row that has none, and does not touch it when it is the same', async () => {
    seed(true);
    const storage = await freshStorage();
    await storage.loadCurrentSession();
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')]));
    expect(state.db.training_players.find(r => r.player_id === 'p2')!.player_ref).toBe('R-ben');
    state.ops = [];
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')]));
    expect(state.ops.some(o => o.startsWith('update:training_players'))).toBe(false);
  });

  it('does not write the placeholder of an empty playoff slot as an identity', async () => {
    seed(true);
    const storage = await freshStorage();
    await storage.loadCurrentSession();
    const tbd = { id: 'null-h-1', name: '–', ref: 'R-bogus' };
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')], {
      matches: [{ id: 'm9', round: 1, homePlayer: p('p1', 'Erik', 'R-erik'), awayPlayer: tbd, homeScore: null, awayScore: null, isCompleted: false, phase: 'playoff' }],
    }));
    const row = state.db.matches.find(m => m.id === 'm9')!;
    expect(row.home_player_ref).toBe('R-erik');
    expect('away_player_ref' in row).toBe(false);
  });

  it('does not write the placeholder of an empty slot on the home side either', async () => {
    seed(true);
    const storage = await freshStorage();
    await storage.loadCurrentSession();
    const tbd = { id: 'null-h-2', name: '–', ref: 'R-bogus' };
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')], {
      matches: [{ id: 'm8', round: 1, homePlayer: tbd, awayPlayer: p('p2', 'Ben', 'R-ben'), homeScore: null, awayScore: null, isCompleted: false, phase: 'playoff' }],
    }));
    const row = state.db.matches.find(m => m.id === 'm8')!;
    expect('home_player_ref' in row).toBe(false);
    expect(row.away_player_ref).toBe('R-ben');
  });

  it('never writes league identities before the database is known to have the column', async () => {
    seed(false);
    const storage = await freshStorage();
    const [league] = await storage.loadLeagues();
    await storage.saveLeague({ ...league, playerStats: [{ ...league.playerStats[0], player: { id: 'p1', name: 'Erik Schwarz', ref: 'R-erik' } }] });
    expect(state.db.player_stats.some(r => 'player_ref' in r)).toBe(false);
  });

  it('writes league rows with their identity and leaves rows without one alone', async () => {
    seed(true);
    const storage = await freshStorage();
    const [league] = await storage.loadLeagues();
    const rows = [
      ...league.playerStats,
      { ...league.playerStats[0], player: { id: 'p9', name: 'Neu', ref: 'R-neu' } },
      { ...league.playerStats[0], player: { id: 'p8', name: 'Ohne' } },
    ];
    await storage.saveLeague({ ...league, playerStats: rows });
    const byName = (n: string) => state.db.player_stats.find(r => r.player_name === n)!;
    expect(byName('Erik Schwarz').player_ref).toBe('R-erik');
    expect(byName('Neu').player_ref).toBe('R-neu');
    expect('player_ref' in byName('Ohne')).toBe(false);
  });
});

describe('loadPlayerRegistry', () => {
  it('reads the players and aliases', async () => {
    seed(true);
    const registry = await (await freshStorage()).loadPlayerRegistry();
    expect(registry.names.get('R-erik')).toBe('Erik Schwarz');
    expect(registry.refByName.get('erik schwarz')).toBe('R-erik');
    expect(registry.refByName.get('erik')).toBe('R-erik');
  });

  it('tells the app that the identity columns exist: they come with the tables', async () => {
    seed(false); // no row with the column was read, so far
    const storage = await freshStorage();
    await storage.loadPlayerRegistry();
    state.db.training_players = [];
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')]));
    expect(state.db.training_players.every(r => r.player_ref)).toBe(true);
  });

  it('does not claim the columns when the tables do not exist', async () => {
    seed(false);
    state.failOn = (_mode, table) => (table === 'players' ? { code: '42P01', message: 'relation "public.players" does not exist' } : false);
    const storage = await freshStorage();
    await storage.loadPlayerRegistry();
    state.failOn = null;
    await storage.saveToHistory(session([p('p1', 'Erik', 'R-erik'), p('p2', 'Ben', 'R-ben')]));
    expect(state.db.training_players.some(r => 'player_ref' in r)).toBe(false);
  });

  it('is empty (and the app keeps working by name) when the tables do not exist', async () => {
    seed(true);
    state.failOn = (_mode, table) => (table === 'players' ? { code: '42P01', message: 'relation "public.players" does not exist' } : false);
    const registry = await (await freshStorage()).loadPlayerRegistry();
    expect(registry.names.size).toBe(0);
  });

  it('reports other errors instead of pretending there are no players', async () => {
    seed(true);
    state.failOn = (_mode, table) => (table === 'players' ? { message: 'permission denied for table players' } : false);
    await expect((await freshStorage()).loadPlayerRegistry()).rejects.toBeTruthy();
  });
});

describe('opening balances of the league check', () => {
  const numbers = { wins: 1, draws: 2, losses: 3, goalsFor: 4, goalsAgainst: 5, points: 6, pointsAgainst: 7, goalDifference: -1, championships: 8, viceChampionships: 9 };
  const dbRow = (league: string, ref: string, extra: Record<string, unknown> = {}) => ({
    league_id: league, player_ref: ref, wins: 1, draws: 2, losses: 3, goals_for: 4, goals_against: 5, points: 6, points_against: 7,
    goal_difference: -1, championships: 8, vice_championships: 9, ...extra,
  });

  it('reads the opening balances of one league by player identity', async () => {
    seed(true);
    state.db.league_opening_balances = [dbRow('L1', 'R-erik'), dbRow('L2', 'R-other')];
    const loaded = await (await freshStorage()).loadOpeningBalances('L1');
    expect([...loaded!.keys()]).toEqual(['R-erik']);
    expect(loaded!.get('R-erik')).toEqual(numbers);
  });

  it('is null when the table does not exist, and throws for other errors', async () => {
    seed(true);
    state.failOn = (_m, table) => (table === 'league_opening_balances' ? { code: '42P01', message: 'relation does not exist' } : false);
    expect(await (await freshStorage()).loadOpeningBalances('L1')).toBeNull();
    state.failOn = (_m, table) => (table === 'league_opening_balances' ? { message: 'permission denied' } : false);
    await expect((await freshStorage()).loadOpeningBalances('L1')).rejects.toBeTruthy();
  });

  it('writes the numbers into the right columns and removes the rows that are no longer wanted, after writing', async () => {
    seed(true);
    state.db.league_opening_balances = [dbRow('L1', 'R-old'), dbRow('L1', 'R-erik', { points: 99 }), dbRow('L2', 'R-old')];
    const storage = await freshStorage();
    state.ops = [];
    await storage.saveOpeningBalances('L1', [{ ref: 'R-erik', opening: numbers }, { ref: 'R-ben', opening: { ...numbers, points: 11 } }]);
    const mine = state.db.league_opening_balances.filter(r => r.league_id === 'L1');
    expect(mine.map(r => r.player_ref).sort()).toEqual(['R-ben', 'R-erik']);
    expect(mine.find(r => r.player_ref === 'R-erik')).toMatchObject({ points: 6, goals_for: 4, goal_difference: -1, vice_championships: 9 });
    expect(mine.find(r => r.player_ref === 'R-ben')!.points).toBe(11);
    // another league is never touched
    expect(state.db.league_opening_balances.filter(r => r.league_id === 'L2').map(r => r.player_ref)).toEqual(['R-old']);
    expect(state.ops.indexOf('delete:league_opening_balances')).toBeGreaterThan(state.ops.indexOf('upsert:league_opening_balances'));
  });

  it('removes nothing when writing fails', async () => {
    seed(true);
    state.db.league_opening_balances = [dbRow('L1', 'R-old')];
    const storage = await freshStorage();
    state.failOn = (mode, table) => mode === 'upsert' && table === 'league_opening_balances';
    await expect(storage.saveOpeningBalances('L1', [{ ref: 'R-erik', opening: numbers }])).rejects.toBeTruthy();
    expect(state.db.league_opening_balances.map(r => r.player_ref)).toEqual(['R-old']);
  });
});
