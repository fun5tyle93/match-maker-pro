import { Star, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PlayerStats } from '@/types';
import { cn } from '@/lib/utils';

interface EternalLeagueTableProps {
  stats: PlayerStats[];
  isAdmin?: boolean;
  onEdit?: (stat: PlayerStats) => void;
  onDelete?: (playerId: string) => void;
}

export function EternalLeagueTable({ stats, isAdmin, onEdit, onDelete }: EternalLeagueTableProps) {
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

  // Sort by points desc, then championships desc
  const sorted = [...stats].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return (b.championships ?? 0) - (a.championships ?? 0);
  });

  return (
    <Card className="animate-fade-in border-accent/30 bg-gradient-to-b from-accent/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-accent">
          <Star className="w-5 h-5" />
          Ewige Tabelle Training
        </CardTitle>
        <p className="text-xs text-muted-foreground">Alle Zeiten • {sorted.length} Spieler</p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Noch keine Einträge vorhanden</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-2">#</th>
                  <th className="text-left py-3 px-2">Spieler</th>
                  <th className="text-center py-3 px-2">Pkt+</th>
                  <th className="text-center py-3 px-2">Pkt−</th>
                  <th className="text-center py-3 px-2">M</th>
                  {isAdmin && <th className="text-right py-3 px-2"></th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((stat, index) => (
                  <tr
                    key={stat.player.id}
                    className={cn(
                      'border-b border-border/50 transition-colors hover:bg-secondary/50',
                      getRankBg(index + 1),
                      'animate-slide-up'
                    )}
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    <td className={cn('py-2 px-2 font-display text-base font-bold', getRankColor(index + 1))}>
                      {index + 1}
                    </td>
                    <td className="py-2 px-2">
                      <span className={cn(
                        'font-semibold',
                        index === 0 && 'text-gold',
                        index === 1 && 'text-silver',
                        index === 2 && 'text-bronze',
                      )}>
                        {stat.player.name}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-primary text-base">
                      {stat.points.toLocaleString('de-DE')}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-muted-foreground text-base">
                      {stat.pointsAgainst.toLocaleString('de-DE')}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-gold">
                      {(stat.championships ?? 0) > 0 ? stat.championships : '—'}
                    </td>
                    {isAdmin && (
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onEdit && (
                            <Button variant="ghost" size="sm" onClick={() => onEdit(stat)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Spieler entfernen?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    "{stat.player.name}" wird aus der ewigen Tabelle entfernt.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => onDelete(stat.player.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Entfernen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    )}
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
