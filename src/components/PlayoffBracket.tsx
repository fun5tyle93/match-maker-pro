import { Crown, Trophy, Swords } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayoffMatch } from '@/types/swiss';
import { getRoundName, getPlayoffWinner } from '@/lib/swissPairing';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { playoffResultError } from '@/lib/tournamentPhases';

interface PlayoffBracketProps {
  matches: PlayoffMatch[];
  /** suddenDeath: the game was decided by sudden death (counts 1.5 / 0.5 points in the final ranking) */
  onUpdateScore?: (matchId: string, homeScore: number, awayScore: number, suddenDeath: boolean) => void;
  readonly?: boolean;
}

export function PlayoffBracket({ matches, onUpdateScore, readonly = false }: PlayoffBracketProps) {
  // Get unique rounds sorted descending (e.g. 4=R16, 3=QF, 2=SF, 1=F)
  const rounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => b - a);

  return (
    <Card className="animate-fade-in overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Playoff-Bracket
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max pb-4">
            {rounds.map(round => (
              <div key={round} className="flex flex-col gap-4">
                <div className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                  {getRoundName(round)}
                </div>
                <div className="flex flex-col justify-around gap-4 h-full">
                  {matches
                    .filter(m => m.round === round)
                    .sort((a, b) => a.matchNumber - b.matchNumber)
                    .map(m => (
                      <BracketMatchCard
                        key={m.id}
                        match={m}
                        onUpdateScore={onUpdateScore}
                        readonly={readonly}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BracketMatchCard({
  match,
  onUpdateScore,
  readonly,
}: {
  match: PlayoffMatch;
  onUpdateScore?: (id: string, h: number, a: number, suddenDeath: boolean) => void;
  readonly?: boolean;
}) {
  const [editHome, setEditHome] = useState('');
  const [editAway, setEditAway] = useState('');
  const [editSd, setEditSd] = useState(false);
  const [editing, setEditing] = useState(false);

  const winner = getPlayoffWinner(match);
  const canEdit = !readonly && !match.isBye && match.homePlayer && match.awayPlayer && (!match.isCompleted || editing);

  const handleSave = () => {
    const h = parseInt(editHome);
    const a = parseInt(editAway);
    if (!isNaN(h) && !isNaN(a) && !error && onUpdateScore) {
      onUpdateScore(match.id, h, a, editSd);
      setEditing(false);
    }
  };

  const bothEntered = editHome !== '' && editAway !== '' &&
    !isNaN(parseInt(editHome)) && !isNaN(parseInt(editAway));
  // A knock-out game has no draw; a sudden-death game is won by exactly one goal (SO § 9 Abs. 1 und 2)
  const error = bothEntered ? playoffResultError(parseInt(editHome), parseInt(editAway), editSd) : null;
  const isValid = bothEntered && !error;

  if (match.isBye) {
    const byePlayer = match.homePlayer ?? match.awayPlayer;
    return (
      <div className="w-48 bg-secondary/30 border border-dashed border-border rounded-lg p-3 text-center">
        <p className="font-semibold text-sm truncate">{byePlayer?.name ?? '–'}</p>
        <p className="text-xs text-muted-foreground mt-1">Freilos ✓</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'w-48 bg-card border border-border rounded-lg overflow-hidden shadow-card transition-all',
      match.isCompleted && !editing && 'opacity-85',
      !match.isCompleted && match.homePlayer && match.awayPlayer && 'hover:border-primary/50',
    )}>
      {/* Home row */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b border-border/50',
        winner?.id === match.homePlayer?.id && 'bg-primary/10',
      )}>
        <span className={cn(
          'text-sm font-semibold truncate flex-1',
          winner?.id === match.homePlayer?.id && 'text-primary',
          !match.homePlayer && 'text-muted-foreground italic',
        )}>
          {winner?.id === match.homePlayer?.id && <Crown className="inline w-3 h-3 mr-1" />}
          {match.homePlayer?.name ?? 'TBD'}
        </span>
        {canEdit ? (
          <Input
            type="number" min="0" inputMode="numeric"
            value={editHome}
            onChange={e => setEditHome(e.target.value)}
            className="w-10 h-7 text-center text-sm p-1 ml-1"
          />
        ) : (
          <span className="font-mono font-bold ml-2 text-sm min-w-[1.5rem] text-center">
            {match.homeScore ?? '–'}
          </span>
        )}
      </div>

      {/* Away row */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2',
        winner?.id === match.awayPlayer?.id && 'bg-primary/10',
      )}>
        <span className={cn(
          'text-sm font-semibold truncate flex-1',
          winner?.id === match.awayPlayer?.id && 'text-primary',
          !match.awayPlayer && 'text-muted-foreground italic',
        )}>
          {winner?.id === match.awayPlayer?.id && <Crown className="inline w-3 h-3 mr-1" />}
          {match.awayPlayer?.name ?? 'TBD'}
        </span>
        {canEdit ? (
          <Input
            type="number" min="0" inputMode="numeric"
            value={editAway}
            onChange={e => setEditAway(e.target.value)}
            className="w-10 h-7 text-center text-sm p-1 ml-1"
          />
        ) : (
          <span className="font-mono font-bold ml-2 text-sm min-w-[1.5rem] text-center">
            {match.awayScore ?? '–'}
          </span>
        )}
      </div>

      {match.isCompleted && !editing && match.suddenDeath && (
        <div className="px-3 py-1 border-t border-border/50 text-[11px] text-muted-foreground text-center">
          Sudden Death
        </div>
      )}

      {canEdit && (
        <div className="px-3 py-2 border-t border-border/50 space-y-1">
          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Durch Sudden Death entschieden</span>
            <Switch checked={editSd} onCheckedChange={setEditSd} aria-label="Durch Sudden Death entschieden" />
          </label>
          {match.round === 1 && (
            <p className="text-[11px] text-muted-foreground">
              Finale: erst Verlängerung (2 × 2 Min.), dann Neuansetzung, dann Sudden Death.
            </p>
          )}
          {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-1 p-2 border-t border-border/50">
          <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSave} disabled={!isValid}>
            OK
          </Button>
          {editing && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
              ✕
            </Button>
          )}
        </div>
      )}
      {!readonly && match.isCompleted && !editing && !match.isBye && (
        <div className="p-2 border-t border-border/50">
          <Button size="sm" variant="ghost" className="w-full h-7 text-xs text-muted-foreground"
            onClick={() => { setEditHome(match.homeScore?.toString() ?? ''); setEditAway(match.awayScore?.toString() ?? ''); setEditSd(!!match.suddenDeath); setEditing(true); }}>
            Korrigieren
          </Button>
        </div>
      )}
    </div>
  );
}
