import { X, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerNameField } from '@/components/PlayerNameField';
import { sameName } from '@/lib/nameMatching';
import { KnownPlayer } from '@/lib/playerPicker';
import { PlayerRegistry } from '@/lib/playerRegistry';
import { Player } from '@/types';
import { cn } from '@/lib/utils';

interface PlayerInputProps {
  players: Player[];
  /** `ref` is the fixed identity of a player from the player list; missing for free text */
  onAddPlayer: (name: string, ref?: string) => void;
  onRemovePlayer: (id: string) => void;
  /** Known players; without it the field takes free text as before */
  registry?: PlayerRegistry | null;
  /** Adds a new person to the player list */
  onCreatePlayer?: (name: string) => Promise<KnownPlayer>;
}

export function PlayerInput({ players, onAddPlayer, onRemovePlayer, registry = null, onCreatePlayer }: PlayerInputProps) {
  const isTaken = (known: KnownPlayer) => players.some(p => p.ref === known.ref || sameName(p.name, known.name));

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Spieler ({players.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <PlayerNameField
          registry={registry}
          onCreate={onCreatePlayer}
          isTaken={isTaken}
          onPick={picked => onAddPlayer(picked.name, picked.ref)}
        />

        <div className="flex flex-wrap gap-2">
          {players.map((player, index) => (
            <div
              key={player.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border animate-scale-in",
                "hover:border-primary/50 transition-all duration-200"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="font-medium">{player.name}</span>
              <button
                onClick={() => onRemovePlayer(player.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {players.length === 0 && (
          <p className="text-muted-foreground text-center py-4">
            Füge mindestens 2 Spieler hinzu, um zu starten
          </p>
        )}
      </CardContent>
    </Card>
  );
}
