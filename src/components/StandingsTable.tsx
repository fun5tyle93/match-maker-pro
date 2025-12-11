import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerStats } from '@/types';
import { cn } from '@/lib/utils';

interface StandingsTableProps {
  stats: PlayerStats[];
  title?: string;
}

export function StandingsTable({ stats, title = "Tabelle" }: StandingsTableProps) {
  const getRankColor = (rank: number) => {
    if (rank === 1) return "text-gold";
    if (rank === 2) return "text-silver";
    if (rank === 3) return "text-bronze";
    return "text-muted-foreground";
  };

  const getRankBg = (rank: number) => {
    if (rank === 1) return "bg-gold/10 border-gold/30";
    if (rank === 2) return "bg-silver/10 border-silver/30";
    if (rank === 3) return "bg-bronze/10 border-bronze/30";
    return "";
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
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-2">#</th>
                  <th className="text-left py-3 px-2">Spieler</th>
                  <th className="text-center py-3 px-2">Pkt</th>
                  <th className="text-center py-3 px-2">Tore</th>
                  <th className="text-center py-3 px-2">Diff</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat, index) => (
                  <tr
                    key={stat.player.id}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-secondary/50",
                      getRankBg(index + 1),
                      "animate-slide-up"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className={cn("py-3 px-2 font-display text-lg", getRankColor(index + 1))}>
                      {index + 1}
                    </td>
                    <td className="py-3 px-2">
                      <span className="font-semibold">{stat.player.name}</span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className="font-mono font-bold text-primary">{stat.points}</span>
                      <span className="text-muted-foreground">:</span>
                      <span className="font-mono text-muted-foreground">{stat.pointsAgainst}</span>
                    </td>
                    <td className="py-3 px-2 text-center font-mono">
                      <span className="text-foreground">{stat.goalsFor}</span>
                      <span className="text-muted-foreground">:</span>
                      <span className="text-muted-foreground">{stat.goalsAgainst}</span>
                    </td>
                    <td className={cn(
                      "py-3 px-2 text-center font-mono font-bold",
                      stat.goalDifference > 0 && "text-primary",
                      stat.goalDifference < 0 && "text-destructive",
                      stat.goalDifference === 0 && "text-muted-foreground"
                    )}>
                      {stat.goalDifference > 0 ? '+' : ''}{stat.goalDifference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
