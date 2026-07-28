import { saveToHistory } from '@/lib/storage';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportUtils';
import { TrainingSession } from '@/types';

function convertSwissToTrainingSession(s: SwissSession): TrainingSession {
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
    name: `Schweizer ${new Date(s.date).toLocaleDateString()}`,
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
const handleExportXLSX = (s: SwissSession | null) => {
  if (!s) return;
  const ts = convertSwissToTrainingSession(s);
  exportTrainingToXLSX(ts);
  toast.success('XLSX exportiert');
};

const handleExportPDF = (s: SwissSession | null) => {
  if (!s) return;
  const ts = convertSwissToTrainingSession(s);
  exportTrainingToPDF(ts);
  toast.success('PDF exportiert');
};

const persistSwissToHistory = async (s: SwissSession) => {
  try {
    const ts = convertSwissToTrainingSession(s);
    await saveToHistory(ts);
    toast.success('Turnier in der Historie gespeichert');
  } catch (err) {
    console.error('Failed to save swiss to history', err);
    toast.error('Fehler beim Speichern in der Historie');
  }
};
