import { useState, useEffect } from 'react';
import { Check, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Match } from '@/types';
import { cn } from '@/lib/utils';

interface MatchCardProps {
  match: Match;
  onUpdateScore: (matchId: string, homeScore: number, awayScore: number) => void;
}

export function MatchCard({ match, onUpdateScore }: MatchCardProps) {
  const [homeScore, setHomeScore] = useState<string>(match.homeScore?.toString() ?? '');
  const [awayScore, setAwayScore] = useState<string>(match.awayScore?.toString() ?? '');

  useEffect(() => {
    setHomeScore(match.homeScore?.toString() ?? '');
    setAwayScore(match.awayScore?.toString() ?? '');
  }, [match.homeScore, match.awayScore]);

  const handleSave = () => {
    const home = parseInt(homeScore);
    const away = parseInt(awayScore);
    if (!isNaN(home) && !isNaN(away) && home >= 0 && away >= 0) {
      onUpdateScore(match.id, home, away);
    }
  };

  const isValid = homeScore !== '' && awayScore !== '' && 
    !isNaN(parseInt(homeScore)) && !isNaN(parseInt(awayScore)) &&
    parseInt(homeScore) >= 0 && parseInt(awayScore) >= 0;

  const getResultColor = () => {
    if (!match.isCompleted || match.homeScore === null || match.awayScore === null) return '';
    if (match.homeScore > match.awayScore) return 'border-l-4 border-l-primary';
    if (match.homeScore < match.awayScore) return 'border-r-4 border-r-primary';
    return 'border-l-4 border-l-accent border-r-4 border-r-accent';
  };

  return (
    <div
      className={cn(
        "bg-card rounded-lg border border-border p-4 transition-all duration-300",
        match.isCompleted ? "opacity-80" : "hover:border-primary/50 hover:shadow-glow",
        getResultColor()
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Home Player */}
        <div className="flex-1 text-center">
          <p className={cn(
            "font-semibold text-sm sm:text-base truncate",
            match.isCompleted && match.homeScore !== null && match.awayScore !== null &&
            match.homeScore > match.awayScore && "text-primary"
          )}>
            {match.homePlayer.name}
          </p>
          <span className="text-xs text-muted-foreground">Heim</span>
        </div>

        {/* Score Input */}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            inputMode="numeric"
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            className="w-14 h-12 text-center text-xl font-bold"
            disabled={match.isCompleted}
          />
          <Swords className="w-5 h-5 text-muted-foreground" />
          <Input
            type="number"
            min="0"
            inputMode="numeric"
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            className="w-14 h-12 text-center text-xl font-bold"
            disabled={match.isCompleted}
          />
        </div>

        {/* Away Player */}
        <div className="flex-1 text-center">
          <p className={cn(
            "font-semibold text-sm sm:text-base truncate",
            match.isCompleted && match.homeScore !== null && match.awayScore !== null &&
            match.awayScore > match.homeScore && "text-primary"
          )}>
            {match.awayPlayer.name}
          </p>
          <span className="text-xs text-muted-foreground">Gast</span>
        </div>
      </div>

      {!match.isCompleted && (
        <div className="mt-3 flex justify-center">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isValid}
            className="gap-1"
          >
            <Check className="w-4 h-4" />
            Speichern
          </Button>
        </div>
      )}
    </div>
  );
}
