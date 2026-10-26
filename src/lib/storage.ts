import { supabase } from '@/integrations/supabase/client';
import { TrainingSession, League, Player, Match, PlayerStats } from '@/types';
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
    player: { id: row.player_id, name: row.player_name },
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

function toSession(row: any, players: Player[], matches: Match[]): TrainingSession {
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
  };
}

function toMatch(row: any): Match {
  return {
    id: row.id,
    round: row.round,
    homePlayer: { id: row.home_player_id, name: row.home_player_name },
    awayPlayer: { id: row.away_player_id, name: row.away_player_name },
    homeScore: row.home_score,
    awayScore: row.away_score,
    isCompleted: row.is_completed,
    phase: (row.phase ?? 'swiss') as 'swiss' | 'playoff',
    playoffRound: row.playoff_round ?? undefined,
    matchNumber: row.match_number ?? undefined,
    isBye: row.is_bye ?? false,
    tableNumber: row.table_number ?? undefined,
  };
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
    return leagueRows.map(row =>
      toLeague(
        row,
        (statsByLeague.get(row.id) ?? []).sort((a, b) => b.points - a.points)
      )
    );
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
  }));
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from('player_stats').upsert(part);
    if (error) throw error;
  }

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
async function saveSessionToDB(session: TrainingSession): Promise<void> {
  const { error: sessError } = await supabase.from('training_sessions').upsert({
    id: session.id,
    name: session.name ?? null,
    date: session.date,
    is_completed: session.isCompleted,
    round_count: session.roundCount,
    matches_per_pairing: session.matchesPerPairing,
    transferred_to_leagues: session.transferredToLeagues ?? [],
    tournament_type: session.tournamentType ?? 'training',
  });
  if (sessError) throw sessError;

  // Write everything first; the removal of rows that are gone only runs when all writes worked
  const removals = await Promise.all([syncPlayers(session), syncMatches(session)]);
  for (const remove of removals) await remove();
}

/** Writes the players; returns the step that removes players that are no longer part of the session. */
async function syncPlayers(session: TrainingSession): Promise<() => Promise<void>> {
  const existing = await fetchAll(() =>
    supabase
      .from('training_players')
      .select('id, player_id, player_name')
      .eq('session_id', session.id)
      .order('id', { ascending: true })
  );
  const rowByPlayer = new Map<string, { id: string; player_name: string }>(existing.map(r => [r.player_id, r]));

  const added = session.players
    .filter(p => !rowByPlayer.has(p.id))
    .map(p => ({ session_id: session.id, player_id: p.id, player_name: p.name }));
  if (added.length > 0) {
    const { error } = await supabase.from('training_players').insert(added);
    if (error) throw error;
  }

  for (const p of session.players) {
    const row = rowByPlayer.get(p.id);
    if (row && row.player_name !== p.name) {
      const { error } = await supabase.from('training_players').update({ player_name: p.name }).eq('id', row.id);
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
    home_player_id: m.homePlayer.id,
    home_player_name: m.homePlayer.name,
    away_player_id: m.awayPlayer.id,
    away_player_name: m.awayPlayer.name,
    home_score: m.homeScore,
    away_score: m.awayScore,
    is_completed: m.isCompleted,
    phase: m.phase ?? 'swiss',
    playoff_round: m.playoffRound ?? null,
    match_number: m.matchNumber ?? null,
    is_bye: m.isBye ?? false,
    table_number: m.tableNumber ?? null,
  }));

  // The lookup of existing rows runs alongside the write; nothing is removed in this function
  const [existing] = await Promise.all([
    fetchAll(() =>
      supabase.from('matches').select('id').eq('session_id', session.id).order('id', { ascending: true })
    ),
    (async () => {
      for (const part of chunk(rows, 500)) {
        const { error } = await supabase.from('matches').upsert(part);
        if (error) throw error;
      }
    })(),
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

  const players: Player[] = playerRows.map(p => ({ id: p.player_id, name: p.player_name }));
  const matches: Match[] = sortMatches(matchRows.map(toMatch));

  return toSession(row, players, matches);
}
