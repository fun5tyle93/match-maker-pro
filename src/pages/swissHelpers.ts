import { saveToHistory, defaultRankingRule } from '@/lib/storage';
import { finalSwissResult } from '@/lib/swissFinal';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportActions';
import { TrainingSession, PlayerStats, Match } from '@/types';
import { SwissSession } from '@/types/swiss';
import { getSwissMatches, getPlayoffFlatMatches, PLAYOFF_PLACEHOLDER_PREFIX } from '@/lib/tournamentPhases';
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
 * Final results of a Swiss session (see finalSwissResult): group phase plus all played playoff games, champion and
 * runner-up. The league check computes the same from the saved evening.
 */
export function computeFinalSwissStats(s: SwissSession): {
  stats: PlayerStats[];
  championName?: string;
  viceChampionName?: string;
} {
  const flat = convertSwissToTrainingSession(s).matches;
  return finalSwissResult(s.players, getSwissMatches(flat), getPlayoffFlatMatches(flat), s.lot);
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
