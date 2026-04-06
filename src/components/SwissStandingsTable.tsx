import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SwissPlayerStat } from '@/types/swiss';
import { cn } from '@/lib/utils';

interface SwissStandingsTableProps {
  stats: SwissPlayerStat[];
  title?: string;
  highlightTop?: number;
}

export function SwissStandingsTable({
  stats,
  title = 'Rangliste',
  highlightTop = 0,
}: SwissStandingsTableProps) {
  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-gold';
    if (rank === 2) return 'text-silver';
    if (rank === 3) return 'text-bronze';
    return 'text-muted-foreground';
  };

  const getRankBg = (rank: number) => {
    if (rank === 1) return 'bg-gold/10 border-gold/30';
    if (rank === 2) return 'bg-silver/10 border-silver/30';
    if (rank === 3) return 'bg-bronze/10 border-bronze/30';
    return '';
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Noch keine Ergebnisse vorhanden
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">Spieler</th>
                  <th className="text-center py-2 px-2" title="Punkte">Pkt</th>
                  <th className="text-center py-2 px-2" title="Spiele">Sp</th>
                  <th className="text-center py-2 px-2" title="Ø Punkte / Spiel">Ø</th>
                  <th className="text-center py-2 px-2" title="Buchholz-Wert (Ø Gegnerpunkte, 0.0–2.0)">BHZ</th>
                  <th className="text-center py-2 px-2" title="Torverhältnis">±</th>
                  <th className="text-center py-2 px-2" title="Spielfrei">Bye</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat, index) => {
                  const rank = index + 1;
                  const isHighlighted = highlightTop > 0 && rank <= highlightTop;
                  return (
                    <tr
                      key={stat.player.id}
                      className={cn(
                        'border-b border-border/50 transition-colors hover:bg-secondary/50 animate-slide-up',
                        getRankBg(rank),
                        isHighlighted && 'ring-1 ring-inset ring-primary/30',
                      )}
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      <td className={cn('py-2 px-2 font-display text-base', getRankColor(rank))}>
                        {rank}
                      </td>
                      <td className="py-2 px-2 font-semibold">{stat.player.name}</td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-primary">
                        {stat.points}
                      </td>
                      <td className="py-2 px-2 text-center text-muted-foreground">
                        {stat.gamesPlayed}
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-foreground">
                        {stat.avgPoints.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-muted-foreground">
                        {stat.buchholz.toFixed(2)}
                      </td>
                      <td className={cn(
                        'py-2 px-2 text-center font-mono font-bold',
                        stat.goalDifference > 0 && 'text-primary',
                        stat.goalDifference < 0 && 'text-destructive',
                        stat.goalDifference === 0 && 'text-muted-foreground',
                      )}>
                        {stat.goalDifference > 0 ? '+' : ''}{stat.goalDifference}
                      </td>
                      <td className="py-2 px-2 text-center text-muted-foreground">
                        {stat.hasHadBye ? '✓' : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Pkt = Punkte</span>
              <span>Sp = Spiele</span>
              <span>Ø = Ø Pkt/Spiel</span>
              <span>BHZ = Buchholz-Zahl</span>
              <span>± = Tordifferenz</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
