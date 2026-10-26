import { toast } from 'sonner';

// The export code pulls in jsPDF, jsPDF-AutoTable and XLSX (several hundred kB).
// It is loaded on the first export click instead of with the page.
type ExportUtils = typeof import('./exportUtils');

/** Runs an export. Resolves to true on success; on failure it shows an error toast and resolves to false. */
async function run(action: (utils: ExportUtils) => void | Promise<void>): Promise<boolean> {
  try {
    await action(await import('./exportUtils'));
    return true;
  } catch (err) {
    console.error('Export failed:', err);
    toast.error('Export fehlgeschlagen. Bitte erneut versuchen.');
    return false;
  }
}

export const exportTrainingToXLSX = (...args: Parameters<ExportUtils['exportTrainingToXLSX']>) =>
  run(utils => utils.exportTrainingToXLSX(...args));

export const exportTrainingToPDF = (...args: Parameters<ExportUtils['exportTrainingToPDF']>) =>
  run(utils => utils.exportTrainingToPDF(...args));

export const exportLeagueToXLSX = (...args: Parameters<ExportUtils['exportLeagueToXLSX']>) =>
  run(utils => utils.exportLeagueToXLSX(...args));

export const exportLeagueToPDF = (...args: Parameters<ExportUtils['exportLeagueToPDF']>) =>
  run(utils => utils.exportLeagueToPDF(...args));
