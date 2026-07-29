import { saveToHistory } from '@/lib/storage';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportUtils';
import { TrainingSession } from '@/types';
import { SwissSession } from '@/types/swiss';
import { toast } from 'sonner';

export function convertSwissToTrainingSession(s: SwissSession): TrainingSession {
  const swissMatches = s.rounds.flatMap(r => r.matches);
  const playoffMatches = (s.playoffMatches ?? []).map(pm => ({
    id: pm.id,
    round: s.config.rounds + pm.round,
    homePlayer: pm.homePlayer ?? { id: `null-${pm.id}`, name: '–' },
    awayPlayer: pm.awayPlayer ?? { id: `null-${pm.id}`, name: '–' },
    homeScore: pm.homeScore,
    awayScore: pm.awayScore,
    isCompleted: pm.isCompleted,
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
  };
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
