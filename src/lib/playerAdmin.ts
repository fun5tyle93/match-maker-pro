/**
 * Overview for the player list administration (page "Spielerliste"): who is how often in use, which league rows
 * have no player yet. Pure function; the database access is in storage.ts (loadPlayerAdmin).
 */
import { normalizeName } from './nameMatching';

export interface PlayerAdminRow {
  id: string;
  displayName: string;
  /** other names of the player (lower case, as stored) */
  aliases: string[];
  /** evenings the player took part in (rows in training_players) */
  evenings: number;
  /** league rows of the player */
  leagueRows: { leagueId: string; leagueName: string }[];
  /** matches with this player, as home or away player */
  matches: number;
}

export interface UnassignedLeagueRow {
  id: string;
  leagueId: string;
  leagueName: string;
  playerName: string;
  points: number;
  championships: number;
}

export interface PlayerAdminData {
  players: PlayerAdminRow[];
  unassigned: UnassignedLeagueRow[];
}

export interface PlayerAdminInput {
  players: { id: string; display_name: string }[];
  aliases: { alias: string; player_id: string }[];
  trainingPlayers: { player_ref: string | null }[];
  matches: { home_player_ref: string | null; away_player_ref: string | null }[];
  leagueRows: { id: string; league_id: string; player_name: string; player_ref: string | null; points: number; championships: number }[];
  leagues: { id: string; name: string }[];
}

/** A player is unused when he is on no evening, in no match and in no league: only then he can be deleted. */
export const isUnused = (p: PlayerAdminRow) => p.evenings === 0 && p.matches === 0 && p.leagueRows.length === 0;

/** Whether the player or one of his names fits the search text (case, spacing, umlauts and accents do not matter). */
export function matchesSearch(p: PlayerAdminRow, text: string): boolean {
  const query = normalizeName(text);
  if (query === '') return true;
  return [p.displayName, ...p.aliases].some(name => normalizeName(name).includes(query));
}

export function buildPlayerAdmin(input: PlayerAdminInput): PlayerAdminData {
  const leagueName = new Map(input.leagues.map(l => [l.id, l.name]));
  const count = <K extends string>(keys: (K | null | undefined)[]) => {
    const map = new Map<string, number>();
    for (const key of keys) if (key) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  };
  const evenings = count(input.trainingPlayers.map(r => r.player_ref));
  // A match with the same player on both sides counts once; there is no such match in practice
  const matches = count(input.matches.flatMap(m => (m.home_player_ref && m.home_player_ref === m.away_player_ref ? [m.home_player_ref] : [m.home_player_ref, m.away_player_ref])));

  const players: PlayerAdminRow[] = input.players.map(p => ({
    id: p.id,
    displayName: p.display_name,
    aliases: input.aliases.filter(a => a.player_id === p.id).map(a => a.alias).sort((a, b) => a.localeCompare(b, 'de')),
    evenings: evenings.get(p.id) ?? 0,
    leagueRows: input.leagueRows
      .filter(r => r.player_ref === p.id)
      .map(r => ({ leagueId: r.league_id, leagueName: leagueName.get(r.league_id) ?? '?' }))
      .sort((a, b) => a.leagueName.localeCompare(b.leagueName, 'de')),
    matches: matches.get(p.id) ?? 0,
  }));
  players.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));

  const unassigned: UnassignedLeagueRow[] = input.leagueRows
    .filter(r => !r.player_ref)
    .map(r => ({
      id: r.id, leagueId: r.league_id, leagueName: leagueName.get(r.league_id) ?? '?',
      playerName: r.player_name, points: r.points, championships: r.championships,
    }))
    .sort((a, b) => a.leagueName.localeCompare(b.leagueName, 'de') || a.playerName.localeCompare(b.playerName, 'de') || b.points - a.points);

  return { players, unassigned };
}

export type PlayerAdminAction = 'rename' | 'merge' | 'delete' | 'assign';

/**
 * German message for a database error of one of the actions. The functions of the database raise readable German
 * messages themselves (for example "Beide Spieler stehen in der Liga ..."); they are passed on as they are.
 */
export function describePlayerAdminError(action: PlayerAdminAction, error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code;
  const message = error?.message ?? '';
  if (action === 'rename' && code === '23505') return 'Den Namen gibt es schon. Zusammenführen statt umbenennen?';
  if (action === 'delete' && code === '23503') return 'Der Spieler kommt noch vor und kann nicht gelöscht werden.';
  if (action === 'assign' && code === '23505') return 'Der Spieler hat in dieser Liga schon eine Zeile.';
  if (code === '42501') return 'Dazu fehlt die Berechtigung. Bitte als Admin einloggen.';
  // P0001 = raise exception in plpgsql: the text is meant for people
  if (code === 'P0001' && message) return message;
  return 'Das hat nicht geklappt. Bitte Verbindung prüfen und erneut versuchen.';
}
