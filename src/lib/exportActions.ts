import { toast } from 'sonner';

// The export code pulls in jsPDF (PDF) or the Excel writer (XLSX), several hundred kB each.
// Each part is loaded on the first click of its own export, not with the page.
type PdfModule = typeof import('./exportPdf');
type XlsxModule = typeof import('./exportXlsx');

/** Runs an export. Resolves to true on success; on failure it shows an error toast and resolves to false. */
async function run<M>(load: () => Promise<M>, action: (module: M) => void | Promise<void>): Promise<boolean> {
  try {
    await action(await load());
    return true;
  } catch (err) {
    console.error('Export failed:', err);
    toast.error('Export fehlgeschlagen. Bitte erneut versuchen.');
    return false;
  }
}

const loadPdf = () => import('./exportPdf');
const loadXlsx = () => import('./exportXlsx');

export const exportTrainingToXLSX = (...args: Parameters<XlsxModule['exportTrainingToXLSX']>) =>
  run(loadXlsx, m => m.exportTrainingToXLSX(...args));

export const exportTrainingToPDF = (...args: Parameters<PdfModule['exportTrainingToPDF']>) =>
  run(loadPdf, m => m.exportTrainingToPDF(...args));

export const exportLeagueToXLSX = (...args: Parameters<XlsxModule['exportLeagueToXLSX']>) =>
  run(loadXlsx, m => m.exportLeagueToXLSX(...args));

export const exportLeagueToPDF = (...args: Parameters<PdfModule['exportLeagueToPDF']>) =>
  run(loadPdf, m => m.exportLeagueToPDF(...args));
