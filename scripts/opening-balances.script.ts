/**
 * Opening balance per league (docs/UMSETZUNGSPLAN.md 10.3): stored standing minus what the evenings contributed.
 * Read-only analysis; writes a JSON report. Input: JSON export of the tables (with player_ref), see the plan.
 *
 *   EXPORT_DIR=<folder with leagues.json, player_stats.json, training_sessions.json, training_players.json, matches.json>
 *   REPORT=<output file> npx vitest run --config vitest.scripts.config.ts scripts/opening-balances.script.ts
 *
 * With SQL_OUT=<file> it also writes the INSERT for league_opening_balances (rows with a fixed identity only).
 * The SQL names leagues and players by name, because the player ids differ per database; it contains club names,
 * so keep it out of the public repository (it lives in the private backup repository, folder ligen/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { bookSessions, openingBalances, sessionResult } from '@/lib/leagueStandings';
import { rankSession } from '@/lib/swissRanking';
import { checkLeague } from '@/lib/leagueCheck';
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
      titles: counted.map(s => { const r = sessionResult(s); return { evening: `${s.date.slice(0, 10)} ${s.name}`, first: r.firstPlace, second: r.secondPlace, players: s.players.length, order: rankSession(s).stats.map(x => `${x.player.name} (${x.points}:${x.pointsAgainst}, ${x.goalDifference})`) }; }), storedRows: league.playerStats.length, bookedPlayers: booked.length, rows, negatives };
  });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));

  if (process.env.SQL_OUT) {
    const names = new Map(read(dir, 'players').map(p => [p.id, p.display_name as string]));
    const q = (text: string) => `'${text.replace(/'/g, "''")}'`;
    const values: string[] = [];
    const skipped: string[] = [];
    for (const entry of report) {
      for (const row of entry.rows) {
        const display = row.player.ref ? names.get(row.player.ref) : undefined;
        if (!row.stored || !display) {
          skipped.push(`${entry.league}: ${row.player.name} (${row.stored ? 'ohne feste Identität' : 'ohne Liga-Zeile'})`);
          continue;
        }
        const o = row.opening;
        values.push(`(${q(entry.league)}, ${q(display)}, ${[o.wins, o.draws, o.losses, o.goalsFor, o.goalsAgainst, o.points, o.pointsAgainst, o.goalDifference, o.championships, o.viceChampionships].join(', ')})`);
      }
    }
    const sql = `-- Startbestand je Liga und Spieler (Schritt E): gespeicherter Stand minus Beiträge der Abende.
-- Erzeugt von scripts/opening-balances.script.ts. ${values.length} Zeilen; nicht enthalten (${skipped.length}): ${skipped.join('; ') || 'keine'}.
INSERT INTO public.league_opening_balances
  (league_id, player_ref, wins, draws, losses, goals_for, goals_against, points, points_against, goal_difference, championships, vice_championships)
SELECT l.id, p.id, v.wins, v.draws, v.losses, v.goals_for, v.goals_against, v.points, v.points_against, v.goal_difference, v.championships, v.vice_championships
FROM (VALUES
${values.join(',\n')}
) AS v(league, name, wins, draws, losses, goals_for, goals_against, points, points_against, goal_difference, championships, vice_championships)
JOIN public.leagues l ON l.name = v.league
JOIN public.players p ON p.display_name = v.name
ON CONFLICT (league_id, player_ref) DO UPDATE SET
  wins = EXCLUDED.wins, draws = EXCLUDED.draws, losses = EXCLUDED.losses, goals_for = EXCLUDED.goals_for,
  goals_against = EXCLUDED.goals_against, points = EXCLUDED.points, points_against = EXCLUDED.points_against,
  goal_difference = EXCLUDED.goal_difference, championships = EXCLUDED.championships,
  vice_championships = EXCLUDED.vice_championships, updated_at = now();
`;
    fs.writeFileSync(process.env.SQL_OUT, sql);
  }
});

/** With league_opening_balances.json in the export: does the check pass for every league? */
it('check against the stored opening balances', () => {
  const dir = process.env.EXPORT_DIR;
  if (!dir || !fs.existsSync(path.join(dir, 'league_opening_balances.json'))) return;
  const balances = read(dir, 'league_opening_balances');
  const { leagues, sessions } = loadExport(dir);
  const lines: string[] = [];
  for (const league of leagues) {
    const openings = new Map(balances.filter(b => b.league_id === league.id).map(b => [b.player_ref as string, {
      wins: b.wins, draws: b.draws, losses: b.losses, goalsFor: b.goals_for, goalsAgainst: b.goals_against, points: b.points,
      pointsAgainst: b.points_against, goalDifference: b.goal_difference, championships: b.championships, viceChampionships: b.vice_championships,
    }]));
    const result = checkLeague(league, sessions.filter(s => (s.transferredToLeagues ?? []).includes(league.id)), openings);
    lines.push(`${league.name}: ${result.ok ? 'berechnet = gespeichert' : 'ABWEICHUNG'} | geprüfte Zeilen ${result.checkedRows}, ohne Identität ${result.notChecked.length}, Abweichungen ${result.differences.length}, fehlende Zeilen ${result.missingRows.length}`);
    if (!result.ok) throw new Error(`${league.name}: ${JSON.stringify(result.differences.slice(0, 5))}`);
  }
  if (process.env.CHECK_OUT) fs.writeFileSync(process.env.CHECK_OUT, lines.join('\n') + '\n');
});
