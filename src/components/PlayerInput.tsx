import { useState } from 'react';
import { Plus, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Player } from '@/types';
import { cn } from '@/lib/utils';

interface PlayerInputProps {
  players: Player[];
  onAddPlayer: (name: string) => void;
  onRemovePlayer: (id: string) => void;
}

export function PlayerInput({ players, onAddPlayer, onRemovePlayer }: PlayerInputProps) {
  const [newPlayerName, setNewPlayerName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlayerName.trim()) {
      onAddPlayer(newPlayerName.trim());
      setNewPlayerName('');
    }
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Spieler ({players.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="text"
            placeholder="Spielername eingeben..."
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!newPlayerName.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </form>

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
