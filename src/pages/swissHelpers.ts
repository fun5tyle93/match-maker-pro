import { saveToHistory, defaultRankingRule } from '@/lib/storage';
import { sessionFinalRanking } from '@/lib/swissRanking';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportActions';
import { TrainingSession, PlayerStats, Match, Player } from '@/types';
import { SwissSession } from '@/types/swiss';
import { computeSwissStats } from '@/lib/swissPairing';
import { toPlayoffMatches, getPlayoffFinalists, PLAYOFF_PLACEHOLDER_PREFIX } from '@/lib/tournamentPhases';
import { titleHoldersFromOrder } from '@/lib/ranking';
import { toast } from 'sonner';

export function convertSwissToTrainingSession(s: SwissSession): TrainingSession {
  const swissMatches: Match[] = s.rounds.flatMap(r => r.matches).map(m => ({ ...m, phase: 'swiss' as const }));
  const playoffMatches = (s.playoffMatches ?? []).map(pm => ({
    id: pm.id,
    round: s.config.rounds + pm.round,
    homePlayer: pm.homePlayer ?? { id: `${PLAYOFF_PLACEHOLDER_PREFIX}h-${pm.id}`, name: '–' },
    awayPlayer: pm.awayPlayer ?? { id: `${PLAYOFF_PLACEHOLDER_PREFIX}a-${pm.id}`, name: '–' },
    homeScore: pm.homeScore,
    awayScore: pm.awayScore,
    isCompleted: pm.isCompleted,
    phase: 'playoff' as const,
    playoffRound: pm.round,
    matchNumber: pm.matchNumber,
    isBye: pm.isBye ?? false,
    suddenDeath: pm.suddenDeath ?? false,
  }));
  const matches = [...swissMatches, ...playoffMatches];
  return {
    id: s.id,
    name: `Schweizer System vom ${new Date(s.date).toLocaleDateString('de-DE')}`,
    date: s.date,
    players: s.players,
    matches,
    isCompleted: s.isCompleted ?? false,
    roundCount: s.config.rounds * (s.config.refereeMode ? 2 : 1),
    matchesPerPairing: 1,
    transferredToLeagues: s.transferredToLeagues ?? [],
    tournamentType: 'swiss',
    rankingRule: defaultRankingRule(),
  };
}

/**
 * Final results of a Swiss session: Vorrunde stats plus all played playoff matches.
 * Champion / runner-up come from the playoff final when a playoff was played,
 * otherwise from the Vorrunden-Rangliste. A player out of competition ("a.K.") gets no title, the next one moves up.
 */
export function computeFinalSwissStats(s: SwissSession): {
  stats: PlayerStats[];
  championName?: string;
  viceChampionName?: string;
} {
  const swissStats = computeSwissStats(s.players, s.rounds, s.lot);

  const acc = new Map<string, PlayerStats>();
  swissStats.forEach(st => {
    acc.set(st.player.id, {
      player: st.player,
      wins: st.wins,
      draws: st.draws,
      losses: st.losses,
      goalsFor: st.goalsFor,
      goalsAgainst: st.goalsAgainst,
      points: st.points,
      pointsAgainst: st.gamesPlayed * 2 - st.points,
      goalDifference: st.goalDifference,
    });
  });

  const playoffMatches = s.playoffMatches ?? [];
  playoffMatches.forEach(pm => {
    if (pm.isBye || !pm.isCompleted || pm.homeScore === null || pm.awayScore === null) return;
    if (!pm.homePlayer || !pm.awayPlayer) return;

    const apply = (playerId: string, gf: number, ga: number) => {
      const cur = acc.get(playerId);
      if (!cur) return;
      const win = gf > ga;
      const draw = gf === ga;
      const points = win ? 2 : draw ? 1 : 0;
      acc.set(playerId, {
        ...cur,
        wins: cur.wins + (win ? 1 : 0),
        draws: cur.draws + (draw ? 1 : 0),
        losses: cur.losses + (!win && !draw ? 1 : 0),
        goalsFor: cur.goalsFor + gf,
        goalsAgainst: cur.goalsAgainst + ga,
        points: cur.points + points,
        pointsAgainst: cur.pointsAgainst + (2 - points),
        goalDifference: cur.goalDifference + (gf - ga),
      });
    };

    apply(pm.homePlayer.id, pm.homeScore, pm.awayScore);
    apply(pm.awayPlayer.id, pm.awayScore, pm.homeScore);
  });

  const stats = Array.from(acc.values());

  // The order the titles come from: after a finished playoff the two finalists, then the rest of the final ranking
  // (SO § 9 Abs. 6); otherwise the standings of the group. Players out of competition ("a.K.") are skipped, the next
  // player moves up. Either title may stay undefined: fewer than two players, or no one left who is eligible.
  const final = sessionFinalRanking(convertSwissToTrainingSession(s));
  const finalists = playoffMatches.length > 0
    ? getPlayoffFinalists(toPlayoffMatches(
        playoffMatches.map(pm => ({
          id: pm.id,
          round: pm.round,
          homePlayer: pm.homePlayer ?? { id: `${PLAYOFF_PLACEHOLDER_PREFIX}h-${pm.id}`, name: '–' },
          awayPlayer: pm.awayPlayer ?? { id: `${PLAYOFF_PLACEHOLDER_PREFIX}a-${pm.id}`, name: '–' },
          homeScore: pm.homeScore,
          awayScore: pm.awayScore,
          isCompleted: pm.isCompleted,
          phase: 'playoff' as const,
          playoffRound: pm.round,
          matchNumber: pm.matchNumber,
          isBye: pm.isBye ?? false,
        })),
      ))
    : { champion: null, runnerUp: null };

  let titleOrder: Player[] = swissStats.map(st => st.player);
  if (finalists.champion) {
    const top = [finalists.champion, ...(finalists.runnerUp ? [finalists.runnerUp] : [])];
    titleOrder = [...top, ...(final ?? []).map(r => r.player).filter(p => !top.some(t => t.id === p.id))];
  }
  const { winner, runnerUp } = titleHoldersFromOrder(titleOrder);
  const championName = winner?.name;
  const viceChampionName = runnerUp?.name;

  // Final ranking order: by the round of elimination, then points, goal difference, opponent (SO § 9 Abs. 6);
  // without a playoff the Swiss standings decide. The numbers in `stats` stay whole (win 2, loss 0) for the leagues.
  const order = (final ? final.map(r => r.player.id) : swissStats.map(st => st.player.id));
  const position = (id: string) => { const i = order.indexOf(id); return i === -1 ? order.length : i; };
  stats.sort((a, b) => position(a.player.id) - position(b.player.id));

  return { stats, championName, viceChampionName };
}

// Expose export helpers in the page via handlers
export const handleExportXLSX = async (s: SwissSession | null) => {
  if (!s) return;
  const ts = convertSwissToTrainingSession(s);
  if (await exportTrainingToXLSX(ts)) toast.success('XLSX exportiert');
};

export const handleExportPDF = async (s: SwissSession | null) => {
  if (!s) return;
  const ts = convertSwissToTrainingSession(s);
  if (await exportTrainingToPDF(ts)) toast.success('PDF exportiert');
};

/** Saves the tournament in the history. Resolves to true when the server confirmed it. */
export const persistSwissToHistory = async (s: SwissSession): Promise<boolean> => {
  try {
    const ts = { ...convertSwissToTrainingSession(s), isCompleted: true };
    await saveToHistory(ts);
    toast.success('Turnier in der Historie gespeichert');
    return true;
  } catch (err) {
    console.error('Failed to save swiss to history', err);
    toast.error('Fehler beim Speichern in der Historie');
    return false;
  }
};
