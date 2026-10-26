import { useMemo, useState } from 'react';
import { ArrowLeftRight, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatShortDate, GameResult, headToHead, PlayerRecord } from '@/lib/statistics';
import { pluralize } from '@/lib/plural';
import { TrainingSession } from '@/types';
import { cn } from '@/lib/utils';

const RESULT_STYLE: Record<GameResult, string> = {
  W: 'bg-primary/15 text-primary',
  D: 'bg-accent/30 text-foreground',
  L: 'bg-secondary text-muted-foreground',
};

interface HeadToHeadCardProps {
  sessions: TrainingSession[];
  /** Players that can be picked (at least one played match). */
  records: PlayerRecord[];
  year?: number;
}

/** Two players, all matches they played against each other. */
export function HeadToHeadCard({ sessions, records, year }: HeadToHeadCardProps) {
  const players = useMemo(
    () => records.filter(r => r.games > 0).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [records],
  );

  // Until the user picks, the two players with the most games are compared
  const [picked, setPicked] = useState<{ a?: string; b?: string }>({});
  const mostGames = useMemo(() => [...players].sort((x, y) => y.games - x.games).map(p => p.key), [players]);
  const exists = (key?: string) => (key && players.some(p => p.key === key) ? key : undefined);
  const keyA = exists(picked.a) ?? mostGames[0];
  const keyB = exists(picked.b) ?? mostGames.find(k => k !== keyA);

  const playerA = players.find(p => p.key === keyA);
  const playerB = players.find(p => p.key === keyB);
  const result = useMemo(
    () => (keyA && keyB ? headToHead(sessions, keyA, keyB, year) : null),
    [sessions, keyA, keyB, year],
  );

  const swap = () => setPicked({ a: keyB, b: keyA });
  const share = (n: number) => (result && result.games > 0 ? (n / result.games) * 100 : 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-accent" />
          Direktvergleich
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {players.length < 2 ? (
          <p className="py-4 text-center text-muted-foreground">
            Für einen Vergleich werden mindestens zwei Spieler mit gespielten Spielen benötigt.
          </p>
        ) : (
          <>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <Select value={keyA} onValueChange={value => setPicked({ a: value, b: keyB })}>
                <SelectTrigger aria-label="Spieler 1">
                  <SelectValue placeholder="Spieler 1" />
                </SelectTrigger>
                <SelectContent>
                  {players.map(p => (
                    <SelectItem key={p.key} value={p.key} disabled={p.key === keyB}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button type="button" variant="outline" size="icon" onClick={swap} aria-label="Spieler tauschen" className="shrink-0 self-center">
                <ArrowLeftRight className="h-4 w-4" />
              </Button>

              <Select value={keyB} onValueChange={value => setPicked({ a: keyA, b: value })}>
                <SelectTrigger aria-label="Spieler 2">
                  <SelectValue placeholder="Spieler 2" />
                </SelectTrigger>
                <SelectContent>
                  {players.map(p => (
                    <SelectItem key={p.key} value={p.key} disabled={p.key === keyA}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {playerA && playerB && result && result.games === 0 && (
              <p className="py-4 text-center text-muted-foreground">
                {playerA.name} und {playerB.name} haben noch nicht gegeneinander gespielt.
              </p>
            )}

            {playerA && playerB && result && result.games > 0 && (
              <div className="space-y-5" data-testid="head-to-head-result">
                <div className="grid grid-cols-3 items-center text-center">
                  <div>
                    <p className="truncate font-semibold">{playerA.name}</p>
                    <p className="font-display text-4xl text-primary" aria-label={`Siege ${playerA.name}`}>{result.winsA}</p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Siege</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{pluralize(result.games, 'Spiel', 'Spiele')}</p>
                    <p className="font-display text-2xl" aria-label="Unentschieden">{result.draws}</p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Unentschieden</p>
                  </div>
                  <div>
                    <p className="truncate font-semibold">{playerB.name}</p>
                    <p className="font-display text-4xl text-foreground" aria-label={`Siege ${playerB.name}`}>{result.winsB}</p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Siege</p>
                  </div>
                </div>

                <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${result.winsA} zu ${result.draws} zu ${result.winsB}`}>
                  <div className="bg-primary" style={{ width: `${share(result.winsA)}%` }} />
                  <div className="bg-accent" style={{ width: `${share(result.draws)}%` }} />
                  <div className="bg-foreground/70" style={{ width: `${share(result.winsB)}%` }} />
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Tore: <span className="font-mono font-semibold text-foreground">{result.goalsA}</span>
                  <span> : </span>
                  <span className="font-mono font-semibold text-foreground">{result.goalsB}</span>
                </p>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Letzte Begegnungen</h3>
                  <ul className="divide-y divide-border/50">
                    {result.meetings.slice(0, 8).map((meeting, index) => (
                      <li key={`${meeting.date}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground">{formatShortDate(meeting.date)}</span>
                          <span className="ml-2">{meeting.eveningName}</span>
                        </span>
                        <span className={cn('shrink-0 rounded px-2 py-0.5 font-mono font-bold', RESULT_STYLE[meeting.result])}>
                          {meeting.goalsA}:{meeting.goalsB}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {result.meetings.length > 8 && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      und {pluralize(result.meetings.length - 8, 'weiteres Spiel', 'weitere Spiele')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
