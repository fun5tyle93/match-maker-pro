/**
 * Opening balance per league (docs/UMSETZUNGSPLAN.md 10.3): stored standing minus what the evenings contributed.
 * Read-only analysis; writes a JSON report. Input: JSON export of the tables (with player_ref), see the plan.
 *
 *   EXPORT_DIR=<folder with leagues.json, player_stats.json, training_sessions.json, training_players.json, matches.json>
 *   REPORT=<output file> npx vitest run --config vitest.scripts.config.ts scripts/opening-balances.script.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { bookSessions, openingBalances, sessionResult } from '@/lib/leagueStandings';
import { League, Match, PlayerStats, TrainingSession } from '@/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const read = (dir: string, table: string): Row[] => JSON.parse(fs.readFileSync(path.join(dir, `${table}.json`), 'utf8'));
const ref = (value: unknown) => (typeof value === 'string' && value ? { ref: value } : {});

export function loadExport(dir: string) {
  const leagues = read(dir, 'leagues');
  const stats = read(dir, 'player_stats');
  const sessionRows = read(dir, 'training_sessions');
  const playerRows = read(dir, 'training_players');
  const matchRows = read(dir, 'matches');

  const sessions: TrainingSession[] = sessionRows.map(row => ({
    id: row.id,
    name: row.name ?? undefined,
    date: row.date,
    isCompleted: row.is_completed,
    roundCount: row.round_count,
    matchesPerPairing: row.matches_per_pairing,
    transferredToLeagues: row.transferred_to_leagues ?? [],
    tournamentType: row.tournament_type ?? 'training',
    rankingRule: row.ranking_rule === 'dtkv2026' ? 'dtkv2026' : 'legacy',
    deciderResults: Array.isArray(row.decider_results) ? row.decider_results : undefined,
    players: playerRows.filter(p => p.session_id === row.id).map(p => ({ id: p.player_id, name: p.player_name, ...ref(p.player_ref) })),
    matches: matchRows.filter(m => m.session_id === row.id).map((m): Match => ({
      id: m.id, round: m.round,
      homePlayer: { id: m.home_player_id, name: m.home_player_name, ...ref(m.home_player_ref) },
      awayPlayer: { id: m.away_player_id, name: m.away_player_name, ...ref(m.away_player_ref) },
      homeScore: m.home_score, awayScore: m.away_score, isCompleted: m.is_completed,
      phase: m.phase ?? 'swiss', playoffRound: m.playoff_round ?? undefined, matchNumber: m.match_number ?? undefined,
      isBye: m.is_bye ?? false, tableNumber: m.table_number ?? undefined, suddenDeath: m.sudden_death ?? false,
    })),
  }));

  const leagueList: League[] = leagues.map(l => ({
    id: l.id, name: l.name, year: l.year, createdAt: l.created_at, isEternal: !!l.is_eternal,
    playerStats: stats.filter(s => s.league_id === l.id).map((s): PlayerStats => ({
      player: { id: s.player_id, name: s.player_name, ...ref(s.player_ref) },
      wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goals_for, goalsAgainst: s.goals_against,
      points: s.points, pointsAgainst: s.points_against, goalDifference: s.goal_difference,
      championships: s.championships, viceChampionships: s.vice_championships,
    })),
  }));
  return { leagues: leagueList, sessions };
}

it('opening balances', () => {
  const dir = process.env.EXPORT_DIR;
  const out = process.env.REPORT;
  if (!dir || !out) throw new Error('EXPORT_DIR und REPORT angeben');
  const { leagues, sessions } = loadExport(dir);
  const report = leagues.map(league => {
    const counted = sessions.filter(s => (s.transferredToLeagues ?? []).includes(league.id));
    const booked = bookSessions(!!league.isEternal, counted);
    const { rows, negatives } = openingBalances(league.playerStats, booked);
    return { league: league.name, eternal: !!league.isEternal, evenings: counted.map(s => `${s.date.slice(0, 10)} ${s.name}`),
      titles: counted.map(s => { const r = sessionResult(s); return { evening: `${s.date.slice(0, 10)} ${s.name}`, first: r.firstPlace, second: r.secondPlace, players: s.players.length }; }), storedRows: league.playerStats.length, bookedPlayers: booked.length, rows, negatives };
  });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
});
