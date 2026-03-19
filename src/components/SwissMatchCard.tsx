import { useState } from 'react';
import { Check, Swords, Pencil, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Match, Player } from '@/types';
import { cn } from '@/lib/utils';

interface SwissMatchCardProps {
  match: Match;
  onUpdateScore: (matchId: string, homeScore: number, awayScore: number) => void;
  readonly?: boolean;
  tableNumber?: number;
  referees?: Player[];
}

export function SwissMatchCard({
  match, onUpdateScore, readonly = false, tableNumber, referees,
}: SwissMatchCardProps) {
  const [homeScore, setHomeScore] = useState<string>(match.homeScore?.toString() ?? '');
  const [awayScore, setAwayScore] = useState<string>(match.awayScore?.toString() ?? '');
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    const h = parseInt(homeScore);
    const a = parseInt(awayScore);
    if (!isNaN(h) && !isNaN(a) && h >= 0 && a >= 0) {
      onUpdateScore(match.id, h, a);
      setIsEditing(false);
    }
  };

  const isValid =
    homeScore !== '' && awayScore !== '' &&
    !isNaN(parseInt(homeScore)) && !isNaN(parseInt(awayScore)) &&
    parseInt(homeScore) >= 0 && parseInt(awayScore) >= 0;

  const showInputs = !readonly && (!match.isCompleted || isEditing);

  const homeWon = match.isCompleted && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
  const awayWon = match.isCompleted && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

  return (
    <div className={cn(
      'bg-card rounded-lg border border-border p-4 transition-all duration-300',
      match.isCompleted && !isEditing ? 'opacity-85' : 'hover:border-primary/50 hover:shadow-glow',
      homeWon && 'border-l-4 border-l-primary',
      awayWon && 'border-r-4 border-r-primary',
      !homeWon && !awayWon && match.isCompleted && 'border-l-4 border-l-accent border-r-4 border-r-accent',
    )}>
      {tableNumber && (
        <div className="text-center mb-2">
          <span className="text-xs font-semibold bg-primary/20 text-primary px-2 py-0.5 rounded">
            Platte {tableNumber}
          </span>
          {referees && referees.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              SR: {referees.map(r => r.name).join(', ')}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        {/* Home */}
        <div className="flex-1 text-center">
          <p className={cn('font-semibold text-sm sm:text-base truncate', homeWon && 'text-primary')}>
            {homeWon && <Crown className="inline w-3 h-3 mr-1 text-gold" />}
            {match.homePlayer.name}
          </p>
          <span className="text-xs text-muted-foreground">Weiß</span>
        </div>

        <div className="flex items-center gap-2">
          {showInputs ? (
            <>
              <Input
                type="number" min="0" inputMode="numeric"
                value={homeScore}
                onChange={e => setHomeScore(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && isValid && handleSave()}
                className="w-14 h-12 text-center text-xl font-bold"
              />
              <Swords className="w-5 h-5 text-muted-foreground" />
              <Input
                type="number" min="0" inputMode="numeric"
                value={awayScore}
                onChange={e => setAwayScore(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && isValid && handleSave()}
                className="w-14 h-12 text-center text-xl font-bold"
              />
            </>
          ) : (
            <>
              <span className="w-14 h-12 flex items-center justify-center text-xl font-bold">
                {match.homeScore ?? '–'}
              </span>
              <Swords className="w-5 h-5 text-muted-foreground" />
              <span className="w-14 h-12 flex items-center justify-center text-xl font-bold">
                {match.awayScore ?? '–'}
              </span>
            </>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 text-center">
          <p className={cn('font-semibold text-sm sm:text-base truncate', awayWon && 'text-primary')}>
            {awayWon && <Crown className="inline w-3 h-3 mr-1 text-gold" />}
            {match.awayPlayer.name}
          </p>
          <span className="text-xs text-muted-foreground">Schwarz</span>
        </div>
      </div>

      {showInputs && (
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={!isValid} className="gap-1">
            <Check className="w-4 h-4" /> Speichern
          </Button>
          {isEditing && (
            <Button size="sm" variant="outline" onClick={() => {
              setHomeScore(match.homeScore?.toString() ?? '');
              setAwayScore(match.awayScore?.toString() ?? '');
              setIsEditing(false);
            }}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {!readonly && match.isCompleted && !isEditing && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}
            className="gap-1 text-muted-foreground hover:text-foreground">
            <Pencil className="w-4 h-4" /> Bearbeiten
          </Button>
        </div>
      )}
    </div>
  );
}
