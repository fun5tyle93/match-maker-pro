import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FinalRow } from '@/lib/ranking';
import { formatPoints, OUT_IN_LABEL } from '@/lib/finalRankingText';
import { cn } from '@/lib/utils';

interface FinalRankingTableProps {
  rows: FinalRow[];
  title?: string;
}

/**
 * Final ranking of a Swiss tournament with a playoff (DTKV Spielordnung § 9 Abs. 6): points of the Swiss phase plus
 * playoff points (a sudden-death win counts 1.5, a sudden-death loss 0.5), placed by the round of elimination.
 */
export function FinalRankingTable({ rows, title = 'Abschlussrangliste' }: FinalRankingTableProps) {
  const color = (place: number) =>
    place === 1 ? 'text-gold' : place === 2 ? 'text-silver' : place === 3 ? 'text-bronze' : 'text-muted-foreground';

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-2">#</th>
                <th className="text-left py-3 px-2">Spieler</th>
                <th className="text-left py-3 px-2">Ausgeschieden in</th>
                <th className="text-center py-3 px-2">Punkte</th>
                <th className="text-center py-3 px-2">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.player.id} className="border-b border-border/50">
                  <td className={cn('py-3 px-2 font-display text-lg', color(row.place))}>{row.place}</td>
                  <td className="py-3 px-2 font-semibold">{row.player.name}</td>
                  <td className="py-3 px-2 text-sm text-muted-foreground">{OUT_IN_LABEL[row.outIn]}</td>
                  <td className="py-3 px-2 text-center font-mono">
                    <span className="font-bold text-primary">{formatPoints(row.points)}</span>
                    {row.playoffPoints > 0 && (
                      <span className="text-xs text-muted-foreground"> (davon Playoff {formatPoints(row.playoffPoints)})</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-center font-mono font-bold">
                    {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Platzierung nach DTKV-Spielordnung § 9 Abs. 6: Punkte aus Vorrunde und Playoff, Sudden-Death-Sieg 1,5 / -Niederlage 0,5 Punkte.
        </p>
      </CardContent>
    </Card>
  );
}
