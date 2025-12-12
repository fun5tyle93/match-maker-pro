import { useState } from 'react';
import { Check, Trophy, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { League, PlayerStats, NameMatch } from '@/types';
import { calculateSimilarity } from '@/lib/pairingGenerator';
import { cn } from '@/lib/utils';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  leagues: League[];
  stats: PlayerStats[];
  onTransfer: (leagueIds: string[], nameMatches: Map<string, string>) => void;
  onCreateLeague: (name: string) => void;
}

export function TransferDialog({
  open,
  onClose,
  leagues,
  stats,
  onTransfer,
  onCreateLeague,
}: TransferDialogProps) {
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [showNewLeague, setShowNewLeague] = useState(false);
  const [similarNames, setSimilarNames] = useState<NameMatch[]>([]);
  const [showSimilarityDialog, setShowSimilarityDialog] = useState(false);
  const [nameMatches, setNameMatches] = useState<Map<string, string>>(new Map());
  const [pendingTransfer, setPendingTransfer] = useState(false);

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

  const findSimilarNames = (): NameMatch[] => {
    const matches: NameMatch[] = [];
    
    selectedLeagues.forEach(leagueId => {
      const league = leagues.find(l => l.id === leagueId);
      if (!league) return;
      
      stats.forEach(stat => {
        const sessionName = stat.player.name.toLowerCase().trim();
        
        // Check for exact match first
        const exactMatch = league.playerStats.find(
          ps => ps.player.name.toLowerCase().trim() === sessionName
        );
        
        if (!exactMatch) {
          // Look for similar names (90%+ similarity)
          league.playerStats.forEach(ps => {
            const leagueName = ps.player.name.toLowerCase().trim();
            const similarity = calculateSimilarity(sessionName, leagueName);
            
            if (similarity >= 0.9 && similarity < 1) {
              // Check if we already have this match
              const existing = matches.find(
                m => m.originalName === stat.player.name && m.matchedName === ps.player.name
              );
              if (!existing) {
                matches.push({
                  originalName: stat.player.name,
                  matchedName: ps.player.name,
                  similarity,
                  isExact: false,
                });
              }
            }
          });
        }
      });
    });
    
    return matches;
  };

  const handleTransfer = () => {
    const similar = findSimilarNames();
    
    if (similar.length > 0) {
      setSimilarNames(similar);
      setShowSimilarityDialog(true);
      setPendingTransfer(true);
    } else {
      onTransfer(selectedLeagues, nameMatches);
      resetAndClose();
    }
  };

  const handleConfirmSimilarity = (originalName: string, matchedName: string | null) => {
    if (matchedName) {
      setNameMatches(prev => new Map(prev).set(originalName, matchedName));
    }
    
    // Remove this match from the list
    const remaining = similarNames.filter(n => n.originalName !== originalName);
    setSimilarNames(remaining);
    
    // If no more matches, proceed with transfer
    if (remaining.length === 0 && pendingTransfer) {
      const updatedMatches = new Map(nameMatches);
      if (matchedName) {
        updatedMatches.set(originalName, matchedName);
      }
      onTransfer(selectedLeagues, updatedMatches);
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setSelectedLeagues([]);
    setNameMatches(new Map());
    setSimilarNames([]);
    setShowSimilarityDialog(false);
    setPendingTransfer(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open && !showSimilarityDialog} onOpenChange={resetAndClose}>
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
            <Button variant="outline" onClick={resetAndClose}>
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

      {/* Similarity Confirmation Dialog */}
      {similarNames.length > 0 && (
        <AlertDialog open={showSimilarityDialog} onOpenChange={setShowSimilarityDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-accent" />
                Ähnlicher Name gefunden
              </AlertDialogTitle>
              <AlertDialogDescription>
                "{similarNames[0].originalName}" ist ähnlich zu "{similarNames[0].matchedName}" 
                ({Math.round(similarNames[0].similarity * 100)}% Übereinstimmung).
                <br /><br />
                Sollen die Ergebnisse zusammengeführt werden?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={() => handleConfirmSimilarity(similarNames[0].originalName, null)}
              >
                Als neuen Spieler anlegen
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => handleConfirmSimilarity(similarNames[0].originalName, similarNames[0].matchedName)}
              >
                Zusammenführen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
