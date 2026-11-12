import { FinalRow } from './ranking';

/** "12,5" – German decimal comma, no trailing ",0". */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.', ',');
}

/** Where a player was eliminated, as shown in the final ranking. */
export const OUT_IN_LABEL: Record<FinalRow['outIn'], string> = {
  winner: 'Turniersieger',
  final: 'Finale',
  semi: 'Halbfinale',
  quarter: 'Viertelfinale',
  round16: 'Achtelfinale',
  round32: 'Sechzehntelfinale',
  swiss: 'Vorrunde',
};
