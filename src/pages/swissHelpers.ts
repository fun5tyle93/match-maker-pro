import { saveToHistory } from '@/lib/storage';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportUtils';
import { TrainingSession, PlayerStats, Match } from '@/types';
import { SwissSession } from '@/types/swiss';
import { computeSwissStats } from '@/lib/swissPairing';
import { toPlayoffMatches, getPlayoffFinalists, PLAYOFF_PLACEHOLDER_PREFIX } from '@/lib/tournamentPhases';
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
  };
}

/**
 * Final results of a Swiss session: Vorrunde stats plus all played playoff matches.
 * Champion / runner-up come from the playoff final when a playoff was played,
 * otherwise from the Vorrunden-Rangliste.
 */
export function computeFinalSwissStats(s: SwissSession): {
  stats: PlayerStats[];
  championName?: string;
  viceChampionName?: string;
} {
  const swissStats = computeSwissStats(s.players, s.rounds);

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

  let championName = swissStats[0]?.player.name;
  let viceChampionName = swissStats[1]?.player.name;

  if (playoffMatches.length > 0) {
    const { champion, runnerUp } = getPlayoffFinalists(toPlayoffMatches(
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
    ));
    if (champion) {
      championName = champion.name;
      viceChampionName = runnerUp?.name;
    }
  }

  // Final ranking order (points, goal diff, goals for)
  stats.sort((a, b) => {
    if (a.player.name === championName) return -1;
    if (b.player.name === championName) return 1;
    if (a.player.name === viceChampionName) return -1;
    if (b.player.name === viceChampionName) return 1;
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });

  return { stats, championName, viceChampionName };
}

// Expose export helpers in the page via handlers
export const handleExportXLSX = (s: SwissSession | null) => {
  if (!s) return;
  const ts = convertSwissToTrainingSession(s);
  exportTrainingToXLSX(ts);
  toast.success('XLSX exportiert');
};

export const handleExportPDF = (s: SwissSession | null) => {
  if (!s) return;
  const ts = convertSwissToTrainingSession(s);
  exportTrainingToPDF(ts);
  toast.success('PDF exportiert');
};

export const persistSwissToHistory = async (s: SwissSession) => {
  try {
    const ts = { ...convertSwissToTrainingSession(s), isCompleted: true };
    await saveToHistory(ts);
    toast.success('Turnier in der Historie gespeichert');
  } catch (err) {
    console.error('Failed to save swiss to history', err);
    toast.error('Fehler beim Speichern in der Historie');
  }
};
