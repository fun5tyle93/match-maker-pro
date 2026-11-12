import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { sortRows } from './ranking';
import { TrainingSession, League, Player, Match, PlayerStats } from '@/types';
import { SwissSession } from '@/types/swiss';
import { PLAYOFF_PLACEHOLDER_PREFIX } from './tournamentPhases';
import { buildRegistry, EMPTY_REGISTRY, PlayerRegistry } from './playerRegistry';
import type { Numbers } from './leagueStandings';
import { sortMatches } from '@/lib/tables';

// ─── Helper: Fetch all rows, paging past the PostgREST row limit (default 1000) ───

async function fetchAll(makeQuery: () => any): Promise<any[]> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

// ─── Helper: run session writes one after another ───
// Autosave, completing an evening and deleting it must never overlap, otherwise an
// older state could overwrite a newer one on the server.

let sessionWrites: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = sessionWrites.then(task, task);
  sessionWrites = result.catch(() => undefined);
  return result;
}

// ─── Helper: Convert DB rows to domain types ───

function toLeague(row: any, statsRows: any[]): League {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    createdAt: row.created_at,
    isEternal: row.is_eternal ?? false,
    playerStats: statsRows.map(toPlayerStats),
  };
}

function toPlayerStats(row: any): PlayerStats {
  return {
    player: { id: row.player_id, name: row.player_name, ...refOf(row, 'player_ref') },
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goals_for,
    goalsAgainst: row.goals_against,
    points: row.points,
    pointsAgainst: row.points_against,
    goalDifference: row.goal_difference,
    championships: row.championships,
    viceChampionships: row.vice_championships,
  };
}

// Columns that were added later. They are only written once the database is known to have them (a row that
// was read contained the column), so the app keeps working in front of a migration, for example in a preview.
const schemaFeatures = { rankingRule: false, suddenDeath: false, swissState: false, playerRef: false };

/** The fixed identity of a stored row, if it has one; also notes that the database has the player_ref columns. */
function refOf(row: Record<string, unknown>, column: string): { ref?: string } {
  if (column in row) schemaFeatures.playerRef = true;
  const value = row[column];
  return typeof value === 'string' && value ? { ref: value } : {};
}

/** Ranking rule for a new evening: the DTKV rule once the database knows it, else the old one. */
export function defaultRankingRule(): 'legacy' | 'dtkv2026' {
  return schemaFeatures.rankingRule ? 'dtkv2026' : 'legacy';
}

function toSession(row: any, players: Player[], matches: Match[]): TrainingSession {
  if ('ranking_rule' in row) schemaFeatures.rankingRule = true;
  if ('swiss_state' in row) schemaFeatures.swissState = true;
  return {
    id: row.id,
    name: row.name ?? undefined,
    date: row.date,
    players,
    matches,
    isCompleted: row.is_completed,
    roundCount: row.round_count,
    matchesPerPairing: row.matches_per_pairing,
    transferredToLeagues: row.transferred_to_leagues ?? [],
    tournamentType: (row.tournament_type ?? 'training') as 'training' | 'swiss',
    rankingRule: row.ranking_rule === 'dtkv2026' ? 'dtkv2026' : 'legacy',
    deciderResults: Array.isArray(row.decider_results) ? row.decider_results : undefined,
  };
}

function toMatch(row: any): Match {
  if ('sudden_death' in row) schemaFeatures.suddenDeath = true;
  return {
    id: row.id,
    round: row.round,
    homePlayer: { id: row.home_player_id, name: row.home_player_name, ...refOf(row, 'home_player_ref') },
    awayPlayer: { id: row.away_player_id, name: row.away_player_name, ...refOf(row, 'away_player_ref') },
    homeScore: row.home_score,
    awayScore: row.away_score,
    isCompleted: row.is_completed,
    phase: (row.phase ?? 'swiss') as 'swiss' | 'playoff',
    playoffRound: row.playoff_round ?? undefined,
    matchNumber: row.match_number ?? undefined,
    isBye: row.is_bye ?? false,
    tableNumber: row.table_number ?? undefined,
    suddenDeath: row.sudden_death ?? false,
  };
}

// ─── Known players ───

/**
 * The known players and their aliases. Without the tables (database not migrated yet) the registry is empty and
 * everything keeps working by name. Any other error is thrown.
 */
export async function loadPlayerRegistry(): Promise<PlayerRegistry> {
  // 42P01 = table does not exist (Postgres), PGRST205 = table not in the schema cache (PostgREST); other errors are real
  const missing = (error: { code?: string; message?: string }) =>
    error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/.test(error.message ?? '');
  const players = await supabase.from('players').select('id, display_name').order('id', { ascending: true });
  if (players.error) {
    if (missing(players.error)) return EMPTY_REGISTRY;
    throw players.error;
  }
  // The tables and the player_ref columns come from the same migration: the list exists, so the columns do too
  schemaFeatures.playerRef = true;
  const aliases = await supabase.from('player_aliases').select('alias, player_id').order('alias', { ascending: true });
  if (aliases.error) {
    if (missing(aliases.error)) return buildRegistry(players.data ?? [], []);
    throw aliases.error;
  }
  return buildRegistry(players.data ?? [], aliases.data ?? []);
}

/**
 * Adds a person to the list of known players and returns it. If the same name (case and spaces ignored) was added
 * in the meantime, for example on another device, that player is returned instead of a second one.
 */
export async function createPlayer(displayName: string): Promise<{ id: string; displayName: string }> {
  const name = displayName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Spielername fehlt');
  const { data, error } = await supabase.from('players').insert({ display_name: name }).select('id, display_name').single();
  if (!error && data) return { id: data.id, displayName: data.display_name };
  if (error?.code === '23505') {
    // unique spelling already taken: use that player
    const registry = await loadPlayerRegistry();
    const ref = registry.refByName.get(name.toLocaleLowerCase('de-DE'));
    if (ref) return { id: ref, displayName: registry.names.get(ref) ?? name };
  }
  throw error ?? new Error('Spieler konnte nicht angelegt werden');
}

// ─── Opening balances of the league check ───

const OPENING_COLUMNS = {
  wins: 'wins', draws: 'draws', losses: 'losses', goalsFor: 'goals_for', goalsAgainst: 'goals_against', points: 'points',
  pointsAgainst: 'points_against', goalDifference: 'goal_difference', championships: 'championships',
  viceChampionships: 'vice_championships',
} as const;

/**
 * The opening balances of a league by player identity, or null when the table does not exist (the check is not set
 * up yet in this database). Any other error is thrown.
 */
export async function loadOpeningBalances(leagueId: string): Promise<Map<string, Numbers> | null> {
  const rows = await fetchAll(() => supabase.from('league_opening_balances').select('*').eq('league_id', leagueId).order('player_ref', { ascending: true })).catch(error => {
    if (error?.code === '42P01' || error?.code === 'PGRST205' || /schema cache|does not exist/.test(error?.message ?? '')) return null;
    throw error;
  });
  if (rows === null) return null;
  return new Map(
    rows.map(r => [
      r.player_ref as string,
      Object.fromEntries(Object.entries(OPENING_COLUMNS).map(([column, dbColumn]) => [column, Number(r[dbColumn]) || 0])) as Numbers,
    ]),
  );
}

/** Replaces the opening balances of a league. Rows are written first, rows that are no longer wanted are removed after. */
export async function saveOpeningBalances(leagueId: string, entries: { ref: string; opening: Numbers }[]): Promise<void> {
  const rows = entries.map(({ ref, opening }) => ({
    league_id: leagueId,
    player_ref: ref,
    updated_at: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(OPENING_COLUMNS).map(([column, dbColumn]) => [dbColumn, opening[column as keyof Numbers]])),
  }));
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from('league_opening_balances').upsert(part as never);
    if (error) throw error;
  }
  const existing = await fetchAll(() => supabase.from('league_opening_balances').select('player_ref').eq('league_id', leagueId).order('player_ref', { ascending: true }));
  const wanted = new Set(entries.map(e => e.ref));
  const stale = existing.map(r => r.player_ref as string).filter(ref => !wanted.has(ref));
  for (const part of chunk(stale)) {
    const { error } = await supabase.from('league_opening_balances').delete().eq('league_id', leagueId).in('player_ref', part);
    if (error) throw error;
  }
}

// ─── Leagues ───

export async function loadLeagues(): Promise<League[]> {
  try {
    const { data: leagueRows, error } = await supabase
      .from('leagues')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!leagueRows || leagueRows.length === 0) return [];

    const leagueIds = leagueRows.map(r => r.id);
    const statsRows = await fetchAll(() =>
      supabase
        .from('player_stats')
        .select('*')
        .in('league_id', leagueIds)
        .order('id', { ascending: true })
    );

    const statsByLeague = new Map<string, any[]>();
    for (const s of statsRows) {
      statsByLeague.set(s.league_id, [...(statsByLeague.get(s.league_id) ?? []), s]);
    }
    return leagueRows.map(row => {
      const league = toLeague(row, statsByLeague.get(row.id) ?? []);
      // Annual league: points, fewer points lost, goal difference, goals scored (SO § 2 Abs. 6);
      // eternal table: points, championships. The sort is stable, so rows that are level keep their order.
      return { ...league, playerStats: sortRows(league.playerStats, !!league.isEternal) };
    });
  } catch (err) {
    console.error('Failed to load leagues:', err);
    throw err;
  }
}

/**
 * Saves one league and its player stats. Rows are only added or changed first;
 * stats of players that are no longer in the league are removed afterwards, so a
 * failure never leaves a league without its data. Throws on any database error.
 */
export async function saveLeague(league: League): Promise<void> {
  const { error: leagueError } = await supabase.from('leagues').upsert({
    id: league.id,
    name: league.name,
    year: league.year,
    created_at: league.createdAt,
    is_eternal: league.isEternal ?? false,
  });
  if (leagueError) throw leagueError;

  // A player is identified by player_id within a league; keep the row id of existing rows
  const existing = await fetchAll(() =>
    supabase
      .from('player_stats')
      .select('id, player_id')
      .eq('league_id', league.id)
      .order('id', { ascending: true })
  );
  const rowIdByPlayer = new Map<string, string>(existing.map(r => [r.player_id, r.id]));

  const rows = league.playerStats.map(s => ({
    id: rowIdByPlayer.get(s.player.id) ?? crypto.randomUUID(),
    league_id: league.id,
    player_id: s.player.id,
    player_name: s.player.name,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goals_for: s.goalsFor,
    goals_against: s.goalsAgainst,
    points: s.points,
    points_against: s.pointsAgainst,
    goal_difference: s.goalDifference,
    championships: s.championships ?? 0,
    vice_championships: s.viceChampionships ?? 0,
    ...(schemaFeatures.playerRef && s.player.ref ? { player_ref: s.player.ref } : {}),
  }));
  await upsertRows('player_stats', rows);

  const wanted = new Set(league.playerStats.map(s => s.player.id));
  await deleteByIds('player_stats', existing.filter(r => !wanted.has(r.player_id)).map(r => r.id));
}

/** Deletes one league (its player stats are removed by the database). */
export async function deleteLeague(leagueId: string): Promise<void> {
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId);
  if (error) throw error;
}

// ─── Current Session ───

// The pointer row only needs a write when the id changes
let lastPointer: string | null | undefined;

async function setCurrentPointer(sessionId: string | null): Promise<void> {
  if (lastPointer === sessionId) return;
  lastPointer = undefined;
  const { error } = await supabase.from('current_session').update({ session_id: sessionId }).eq('id', 1);
  if (error) throw error;
  lastPointer = sessionId;
}

/** Saves the running session and marks it as current. Throws on any database error. */
export function saveCurrentSession(session: TrainingSession | null): Promise<void> {
  return serialized(async () => {
    if (!session) {
      await setCurrentPointer(null);
      return;
    }
    await saveSessionToDB(session);
    await setCurrentPointer(session.id);
  });
}

/** Loads the running session. Throws on a database error, so "failed to load" is never mistaken for "no session". */
export async function loadCurrentSession(): Promise<TrainingSession | null> {
  const { data, error } = await supabase.from('current_session').select('session_id').eq('id', 1).maybeSingle();
  if (error) throw error;
  lastPointer = data?.session_id ?? null;
  if (!data?.session_id) return null;
  return loadSessionById(data.session_id);
}

// ─── Training History ───

/** Saves a session (also finished ones). Throws on any database error. */
export function saveToHistory(session: TrainingSession): Promise<void> {
  return serialized(() => saveSessionToDB(session));
}

// ─── Running Swiss tournament ───

let swissStateProbe: Promise<boolean> | null = null;

/**
 * Whether the database can hold a running Swiss tournament (column swiss_state). Without it the tournament stays
 * in the browser, as before. Only a definite answer is remembered; a connection problem is thrown.
 */
export function swissStateSupported(): Promise<boolean> {
  if (schemaFeatures.swissState) return Promise.resolve(true);
  swissStateProbe ??= (async () => {
    const { error } = await supabase.from('training_sessions').select('swiss_state').limit(1);
    if (!error) {
      schemaFeatures.swissState = true;
      return true;
    }
    // 42703: column does not exist (Postgres); PGRST204/PGRST200-style messages come from PostgREST
    if (error.code === '42703' || /swiss_state/.test(error.message ?? '')) return false;
    throw error;
  })().catch(err => {
    swissStateProbe = null;
    throw err;
  });
  return swissStateProbe;
}

/** Saves the running Swiss tournament: the tables (so history, statistics and exports work) and its full state. */
export function saveSwissSession(asSession: TrainingSession, state: SwissSession): Promise<void> {
  return serialized(() => saveSessionToDB(asSession, state));
}

/** The newest Swiss tournament that is still running, or null. Needs the swiss_state column. */
export async function loadRunningSwissSession(): Promise<SwissSession | null> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('tournament_type', 'swiss')
    .eq('is_completed', false)
    .not('swiss_state', 'is', null)
    .order('date', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row?.swiss_state ? (row.swiss_state as unknown as SwissSession) : null;
}

/**
 * Takes a Swiss tournament off the running slot ("reset"). Nothing is deleted: the evening, its players and
 * matches stay in the database, only the running state is cleared.
 */
export function discardSwissSession(id: string): Promise<void> {
  return serialized(async () => {
    const { error } = await supabase.from('training_sessions').update({ swiss_state: null }).eq('id', id);
    if (error) throw error;
  });
}

export async function loadHistory(): Promise<TrainingSession[]> {
  try {
    const sessionRows = await fetchAll(() =>
      supabase
        .from('training_sessions')
        .select('*')
        .eq('is_completed', true)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
    );
    if (sessionRows.length === 0) return [];

    const sessionIds = sessionRows.map(r => r.id);
    const [playerRows, matchRows] = await Promise.all([
      fetchAll(() =>
        supabase.from('training_players').select('*').in('session_id', sessionIds).order('id', { ascending: true })
      ),
      fetchAll(() =>
        supabase.from('matches').select('*').in('session_id', sessionIds).order('id', { ascending: true })
      ),
    ]);

    const playersBySession = groupBy(playerRows, r => r.session_id);
    const matchesBySession = groupBy(matchRows, r => r.session_id);

    return sessionRows.map(row => {
      const players: Player[] = (playersBySession.get(row.id) ?? []).map(p => ({
        id: p.player_id,
        name: p.player_name,
        ...refOf(p, 'player_ref'),
      }));
      const matches: Match[] = sortMatches((matchesBySession.get(row.id) ?? []).map(toMatch));
      return toSession(row, players, matches);
    });
  } catch (err) {
    console.error('Failed to load history:', err);
    throw err;
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

export function deleteFromHistory(sessionId: string): Promise<void> {
  return serialized(async () => {
    // Also clear current_session if it points here
    const { error: pointerError } = await supabase.from('current_session').update({ session_id: null }).eq('session_id', sessionId);
    if (pointerError) throw pointerError;
    lastPointer = undefined;
    const { error } = await supabase.from('training_sessions').delete().eq('id', sessionId);
    if (error) throw error;
  });
}

// ─── Sessions (legacy compat) ───

export async function loadSessions(): Promise<TrainingSession[]> {
  return loadHistory();
}

export async function saveSessions(_sessions: TrainingSession[]): Promise<void> {
  // Sessions are already saved individually via saveToHistory / saveCurrentSession
}

// ─── Internal helpers ───

const ID_CHUNK = 100;

function chunk<T>(items: T[], size = ID_CHUNK): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/**
 * Upserts rows whose keys differ (a reference is only written when it is known). Rows with the same keys go in one
 * request: an upsert writes the columns of its rows, so a column that is left out stays as it is in the database.
 * That is what keeps a stored reference when the app does not know it (for example an old browser tab).
 */
async function upsertRows(table: 'matches' | 'player_stats', rows: Record<string, unknown>[]): Promise<void> {
  const bySignature = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const signature = Object.keys(row).sort().join(',');
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), row]);
  }
  for (const group of bySignature.values()) {
    for (const part of chunk(group, 500)) {
      const { error } = await supabase.from(table).upsert(part as never);
      if (error) throw error;
    }
  }
}

async function deleteByIds(table: 'matches' | 'training_players' | 'player_stats', ids: string[]): Promise<void> {
  for (const part of chunk(ids)) {
    const { error } = await supabase.from(table).delete().in('id', part);
    if (error) throw error;
  }
}

/**
 * Saves a session. Rows are only added or changed first; rows that no longer
 * belong to the session are removed afterwards. A failure therefore never
 * leaves a session without its players or matches. Throws on any database error.
 */
async function saveSessionToDB(session: TrainingSession, swissState?: SwissSession): Promise<void> {
  const { error: sessError } = await supabase.from('training_sessions').upsert({
    id: session.id,
    name: session.name ?? null,
    date: session.date,
    is_completed: session.isCompleted,
    round_count: session.roundCount,
    matches_per_pairing: session.matchesPerPairing,
    transferred_to_leagues: session.transferredToLeagues ?? [],
    tournament_type: session.tournamentType ?? 'training',
    ...(schemaFeatures.rankingRule
      ? { ranking_rule: session.rankingRule ?? 'legacy', decider_results: session.deciderResults ?? null }
      : {}),
    // The running Swiss tournament; left out (not set to null) whenever it is not given, so saving a finished
    // evening or a training evening never overwrites it
    ...(schemaFeatures.swissState && swissState !== undefined ? { swiss_state: swissState as unknown as Json } : {}),
  });
  if (sessError) throw sessError;

  // Write everything first; the removal of rows that are gone only runs when all writes worked
  const removals = await Promise.all([syncPlayers(session), syncMatches(session)]);
  for (const remove of removals) await remove();
}

/**
 * Id under which a player of a match is stored. An empty slot of the playoff bracket (TBD) or a bye has no player;
 * the app marks it with a placeholder id that is not a valid uuid, but the column needs one. The stored placeholder
 * keeps the name "–", which is how it is recognised when it is read back (see toPlayoffMatches).
 */
function storedPlayerId(player: Player, matchId: string, side: 'a' | 'b'): string {
  return player.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) ? matchId.slice(0, -1) + side : player.id;
}

/** Writes the players; returns the step that removes players that are no longer part of the session. */
async function syncPlayers(session: TrainingSession): Promise<() => Promise<void>> {
  const existing = await fetchAll(() =>
    supabase
      .from('training_players')
      .select(schemaFeatures.playerRef ? 'id, player_id, player_name, player_ref' : 'id, player_id, player_name')
      .eq('session_id', session.id)
      .order('id', { ascending: true })
  );
  const rowByPlayer = new Map<string, { id: string; player_name: string; player_ref?: string | null }>(
    existing.map(r => [r.player_id, r]),
  );
  const withRef = (p: Player) => (schemaFeatures.playerRef && p.ref ? { player_ref: p.ref } : {});

  const added = session.players
    .filter(p => !rowByPlayer.has(p.id))
    .map(p => ({ session_id: session.id, player_id: p.id, player_name: p.name, ...withRef(p) }));
  if (added.length > 0) {
    // One request per set of keys, so a row without a reference never writes an empty one
    const withReferences = added.filter(r => 'player_ref' in r);
    const without = added.filter(r => !('player_ref' in r));
    for (const rows of [withReferences, without]) {
      if (rows.length === 0) continue;
      const { error } = await supabase.from('training_players').insert(rows);
      if (error) throw error;
    }
  }

  for (const p of session.players) {
    const row = rowByPlayer.get(p.id);
    if (!row) continue;
    // Name changed, or the reference is known now but not stored yet (never replace a stored one with nothing)
    const patch: { player_name?: string; player_ref?: string } = {};
    if (row.player_name !== p.name) patch.player_name = p.name;
    if (schemaFeatures.playerRef && p.ref && row.player_ref !== p.ref) patch.player_ref = p.ref;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('training_players').update(patch).eq('id', row.id);
      if (error) throw error;
    }
  }

  const wanted = new Set(session.players.map(p => p.id));
  return () => deleteByIds('training_players', existing.filter(r => !wanted.has(r.player_id)).map(r => r.id));
}

/** Writes the matches; returns the step that removes matches that are no longer part of the session. */
async function syncMatches(session: TrainingSession): Promise<() => Promise<void>> {
  const rows = session.matches.map(m => ({
    id: m.id,
    session_id: session.id,
    round: m.round,
    home_player_id: storedPlayerId(m.homePlayer, m.id, 'a'),
    home_player_name: m.homePlayer.name,
    away_player_id: storedPlayerId(m.awayPlayer, m.id, 'b'),
    away_player_name: m.awayPlayer.name,
    home_score: m.homeScore,
    away_score: m.awayScore,
    is_completed: m.isCompleted,
    phase: m.phase ?? 'swiss',
    playoff_round: m.playoffRound ?? null,
    match_number: m.matchNumber ?? null,
    is_bye: m.isBye ?? false,
    table_number: m.tableNumber ?? null,
    ...(schemaFeatures.suddenDeath ? { sudden_death: m.suddenDeath ?? false } : {}),
    ...(schemaFeatures.playerRef && m.homePlayer.ref && !m.homePlayer.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) ? { home_player_ref: m.homePlayer.ref } : {}),
    ...(schemaFeatures.playerRef && m.awayPlayer.ref && !m.awayPlayer.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) ? { away_player_ref: m.awayPlayer.ref } : {}),
  }));

  // The lookup of existing rows runs alongside the write; nothing is removed in this function
  const [existing] = await Promise.all([
    fetchAll(() =>
      supabase.from('matches').select('id').eq('session_id', session.id).order('id', { ascending: true })
    ),
    upsertRows('matches', rows),
  ]);

  const wanted = new Set(session.matches.map(m => m.id));
  return () => deleteByIds('matches', existing.filter(r => !wanted.has(r.id)).map(r => r.id));
}

async function loadSessionById(sessionId: string): Promise<TrainingSession | null> {
  const { data: row, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const [playerRows, matchRows] = await Promise.all([
    fetchAll(() =>
      supabase.from('training_players').select('*').eq('session_id', sessionId).order('id', { ascending: true })
    ),
    fetchAll(() =>
      supabase.from('matches').select('*').eq('session_id', sessionId).order('id', { ascending: true })
    ),
  ]);

  const players: Player[] = playerRows.map(p => ({ id: p.player_id, name: p.player_name, ...refOf(p, 'player_ref') }));
  const matches: Match[] = sortMatches(matchRows.map(toMatch));

  return toSession(row, players, matches);
}
