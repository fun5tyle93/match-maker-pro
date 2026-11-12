import { useState } from 'react';
import { Check, Trophy, Plus, AlertCircle, Infinity } from 'lucide-react';
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
import { NameMatchesByLeague } from '@/lib/leagueTransfer';
import {
  CandidateKind,
  NameQuestion,
  TransferPlan,
  defaultAnswer,
  planTransferMatches,
  questionKey,
} from '@/lib/nameMatching';
import { cn } from '@/lib/utils';

const KIND_TEXT: Record<CandidateKind, string> = {
  typo: 'ähnlich geschrieben',
  reordered: 'gleiche Wörter, andere Reihenfolge',
  partial: 'Name enthält den anderen',
  firstname: 'gleicher Vorname',
};

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  leagues: League[];
  stats: PlayerStats[];
  /** `nameMatches`: per league, the confirmed assignment of evening names to players already in that league */
  onTransfer: (leagueIds: string[], nameMatches: NameMatchesByLeague) => void;
  onCreateLeague: (name: string) => void;
  /** Leagues that already received this evening (for example after an interrupted transfer) */
  transferredLeagueIds?: string[];
}

export function TransferDialog({
  open,
  onClose,
  leagues,
  stats,
  onTransfer,
  onCreateLeague,
  transferredLeagueIds = [],
}: TransferDialogProps) {
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [showNewLeague, setShowNewLeague] = useState(false);
  // Set when some names need an answer before transferring
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});

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
    const chosen = leagues.filter(l => selectedLeagues.includes(l.id));
    const found = planTransferMatches(
      stats.map(stat => stat.player.name),
      chosen.map(l => ({
        id: l.id,
        name: l.name,
        rows: l.playerStats.map(ps => ({ name: ps.player.name, points: ps.points, championships: ps.championships || 0 })),
      })),
    );

    if (found.questions.length === 0) {
      onTransfer(selectedLeagues, new Map());
      resetAndClose();
      return;
    }
    setAnswers(Object.fromEntries(found.questions.map(q => [questionKey(q), defaultAnswer(q)])));
    setPlan(found);
  };

  const handleConfirm = () => {
    if (!plan) return;
    const matches: NameMatchesByLeague = new Map();
    for (const q of plan.questions) {
      const answer = answers[questionKey(q)];
      if (!answer) continue; // "new player"
      const forLeague = matches.get(q.leagueId) ?? new Map<string, string>();
      forLeague.set(q.eveningName, answer);
      matches.set(q.leagueId, forLeague);
    }
    onTransfer(selectedLeagues, matches);
    resetAndClose();
  };

  const resetAndClose = () => {
    setSelectedLeagues([]);
    setPlan(null);
    setAnswers({});
    onClose();
  };

  const showLeagueNames = selectedLeagues.length > 1;

  return (
    <>
      <Dialog open={open && !plan} onOpenChange={resetAndClose}>
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
                    <span className="font-medium flex items-center gap-1">
                      {league.isEternal && <Infinity className="w-3.5 h-3.5 text-accent shrink-0" />}
                      {league.name}
                      {league.isEternal && (
                        <span className="text-xs text-muted-foreground ml-1">(Pkt + M)</span>
                      )}
                      {transferredLeagueIds.includes(league.id) && (
                        <span className="text-xs text-muted-foreground ml-2">✓ bereits übertragen</span>
                      )}
                    </span>
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

      {/* Questions about names that look like players already in a league */}
      <Dialog open={open && !!plan} onOpenChange={resetAndClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-accent" />
              Ist das dieselbe Person?
            </DialogTitle>
            <DialogDescription>
              Diese Namen gibt es in der Liga so noch nicht, sie sehen aber wie vorhandene Spieler aus. Bitte wählen,
              wohin die Ergebnisse gehören.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {plan?.questions.map(q => (
              <QuestionCard
                key={questionKey(q)}
                question={q}
                showLeague={showLeagueNames}
                isEternal={!!leagues.find(l => l.id === q.leagueId)?.isEternal}
                value={answers[questionKey(q)] ?? null}
                onChange={value => setAnswers(prev => ({ ...prev, [questionKey(q)]: value }))}
              />
            ))}

            {plan && plan.autoMatches.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
                <p>Automatisch zugeordnet (nur Schreibweise verschieden):</p>
                {plan.autoMatches.map(m => (
                  <p key={`${m.leagueId}|${m.eveningName}`}>
                    „{m.eveningName}“ → „{m.leagueRowName}“
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlan(null)}>
              Zurück
            </Button>
            <Button onClick={handleConfirm}>Übertragen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuestionCard({
  question,
  showLeague,
  isEternal,
  value,
  onChange,
}: {
  question: NameQuestion;
  showLeague: boolean;
  isEternal: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const options: { value: string | null; label: string; detail?: string }[] = [
    ...question.candidates.map(c => ({
      value: c.name,
      label: c.name,
      detail: `${KIND_TEXT[c.kind]} · ${c.points} Pkt${isEternal && c.championships > 0 ? ` · ${c.championships} M` : ''}`,
    })),
    { value: null, label: 'Nein, neuer Spieler', detail: 'wird in der Liga neu angelegt' },
  ];

  return (
    <div className="rounded-lg border p-3 space-y-2" role="radiogroup" aria-label={`Zuordnung für ${question.eveningName}`}>
      <p className="text-sm">
        <span className="font-medium">„{question.eveningName}“</span>
        {showLeague && <span className="text-muted-foreground"> in {question.leagueName}</span>}
      </p>
      {options.map(option => {
        const selected = value === option.value;
        return (
          <button
            key={option.value ?? '__new__'}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-all',
              selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
            )}
          >
            <span>
              <span className="font-medium">{option.label}</span>
              {option.detail && <span className="block text-xs text-muted-foreground">{option.detail}</span>}
            </span>
            {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
