import { supabase } from '@/integrations/supabase/client';
import { TrainingSession, League, Player, Match, PlayerStats } from '@/types';

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
  };
}

// ─── Leagues ───

export async function loadLeagues(): Promise<League[]> {
  const { data: leagueRows, error } = await supabase
    .from('leagues')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load leagues:', error);
    return [];
  }

  const leagues: League[] = [];
  for (const row of leagueRows ?? []) {
    const { data: statsRows } = await supabase
      .from('player_stats')
      .select('*')
      .eq('league_id', row.id)
      .order('points', { ascending: false });

    leagues.push(toLeague(row, statsRows ?? []));
  }
  return leagues;
}

export async function saveLeagues(leagues: League[]): Promise<void> {
  // Delete all existing leagues and re-insert
  // (simpler than diffing, and league count is small)
  const { error: delError } = await supabase.from('leagues').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) console.error('Failed to delete leagues:', delError);

  for (const league of leagues) {
    const { error: leagueError } = await supabase.from('leagues').insert({
      id: league.id,
      name: league.name,
      year: league.year,
      created_at: league.createdAt,
      is_eternal: league.isEternal ?? false,
    });
    if (leagueError) {
      console.error('Failed to insert league:', leagueError);
      continue;
    }

    if (league.playerStats.length > 0) {
      const statsInserts = league.playerStats.map(s => ({
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
      const { error: statsError } = await supabase.from('player_stats').insert(statsInserts);
      if (statsError) console.error('Failed to insert player_stats:', statsError);
    }
  }
}

// ─── Current Session ───

export async function saveCurrentSession(session: TrainingSession | null): Promise<void> {
  if (!session) {
    // Clear current session pointer
    await supabase.from('current_session').update({ session_id: null }).eq('id', 1);
    return;
  }

  // Upsert the session itself
  await saveSessionToDB(session);

  // Set current session pointer
  await supabase.from('current_session').update({ session_id: session.id }).eq('id', 1);
}

export async function loadCurrentSession(): Promise<TrainingSession | null> {
  const { data } = await supabase.from('current_session').select('session_id').eq('id', 1).maybeSingle();
  if (!data?.session_id) return null;
  return loadSessionById(data.session_id);
}

// ─── Training History ───

export async function saveToHistory(session: TrainingSession): Promise<void> {
  await saveSessionToDB(session);
}

export async function loadHistory(): Promise<TrainingSession[]> {
  const { data: rows, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('is_completed', true)
    .order('date', { ascending: false });

  if (error) {
    console.error('Failed to load history:', error);
    return [];
  }

  const sessions: TrainingSession[] = [];
  for (const row of rows ?? []) {
    const session = await loadSessionById(row.id);
    if (session) sessions.push(session);
  }
  return sessions;
}

export async function deleteFromHistory(sessionId: string): Promise<void> {
  // Also clear current_session if it points here
  await supabase.from('current_session').update({ session_id: null }).eq('session_id', sessionId);
  await supabase.from('training_sessions').delete().eq('id', sessionId);
}

// ─── Sessions (legacy compat) ───

export async function loadSessions(): Promise<TrainingSession[]> {
  return loadHistory();
}

export async function saveSessions(_sessions: TrainingSession[]): Promise<void> {
  // Sessions are already saved individually via saveToHistory / saveCurrentSession
}

// ─── Internal helpers ───

async function saveSessionToDB(session: TrainingSession): Promise<void> {
  // Upsert session
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
  if (sessError) {
    console.error('Failed to upsert session:', sessError);
    return;
  }

  // Delete old players/matches and re-insert
  await supabase.from('training_players').delete().eq('session_id', session.id);
  await supabase.from('matches').delete().eq('session_id', session.id);

  if (session.players.length > 0) {
    await supabase.from('training_players').insert(
      session.players.map(p => ({
        session_id: session.id,
        player_id: p.id,
        player_name: p.name,
      }))
    );
  }

  if (session.matches.length > 0) {
    await supabase.from('matches').insert(
      session.matches.map(m => ({
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
      }))
    );
  }
}

async function loadSessionById(sessionId: string): Promise<TrainingSession | null> {
  const { data: row } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (!row) return null;

  const { data: playerRows } = await supabase
    .from('training_players')
    .select('*')
    .eq('session_id', sessionId);

  const { data: matchRows } = await supabase
    .from('matches')
    .select('*')
    .eq('session_id', sessionId)
    .order('round', { ascending: true });

  const players: Player[] = (playerRows ?? []).map(p => ({ id: p.player_id, name: p.player_name }));
  const matches: Match[] = (matchRows ?? []).map(toMatch);

  return toSession(row, players, matches);
}
