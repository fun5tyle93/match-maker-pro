import { useState } from 'react';
import { Check, Trophy, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { League, PlayerStats } from '@/types';
import { cn } from '@/lib/utils';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  leagues: League[];
  onTransfer: (leagueIds: string[]) => void;
  onCreateLeague: (name: string) => void;
}

export function TransferDialog({
  open,
  onClose,
  leagues,
  onTransfer,
  onCreateLeague,
}: TransferDialogProps) {
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [showNewLeague, setShowNewLeague] = useState(false);

  const handleToggleLeague = (leagueId: string) => {
    setSelectedLeagues((prev) =>
      prev.includes(leagueId)
        ? prev.filter((id) => id !== leagueId)
        : [...prev, leagueId]
    );
  };

  const handleCreateLeague = () => {
    if (newLeagueName.trim()) {
      onCreateLeague(newLeagueName.trim());
      setNewLeagueName('');
      setShowNewLeague(false);
    }
  };

  const handleTransfer = () => {
    onTransfer(selectedLeagues);
    setSelectedLeagues([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent" />
            Ergebnisse übertragen
          </DialogTitle>
          <DialogDescription>
            Wähle eine oder mehrere Ligen, um die Ergebnisse zu übertragen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {leagues.length === 0 && !showNewLeague ? (
            <p className="text-muted-foreground text-center py-4">
              Noch keine Ligen vorhanden. Erstelle eine neue Liga!
            </p>
          ) : (
            <div className="space-y-2">
              {leagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => handleToggleLeague(league.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-lg border transition-all",
                    selectedLeagues.includes(league.id)
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="font-medium">{league.name}</span>
                  {selectedLeagues.includes(league.id) && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}

          {showNewLeague ? (
            <div className="flex gap-2">
              <Input
                placeholder="Liganame eingeben..."
                value={newLeagueName}
                onChange={(e) => setNewLeagueName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
              />
              <Button onClick={handleCreateLeague} disabled={!newLeagueName.trim()}>
                Erstellen
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowNewLeague(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Neue Liga erstellen
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={selectedLeagues.length === 0}
          >
            Übertragen ({selectedLeagues.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
