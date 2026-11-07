import { Coffee } from 'lucide-react';
import { Player } from '@/types';

/** Shows who sits out a round, so it can be read out together with the pairings. */
export function PauseNotice({ players }: { players: Player[] }) {
  if (players.length === 0) return null;
  const names = players.map(p => p.name).join(', ');
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3"
      role="note"
      aria-label={`Pause: ${names}`}
    >
      <Coffee className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">Pause</span>
      <span className="font-display text-lg">{names}</span>
    </div>
  );
}
