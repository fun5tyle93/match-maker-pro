import { useState, useEffect } from 'react';
import { History as HistoryIcon, Calendar, Users, Eye, Trash2, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { StandingsTable } from '@/components/StandingsTable';
import { MatchCard } from '@/components/MatchCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TrainingSession, Match } from '@/types';
import { loadHistory, deleteFromHistory } from '@/lib/storage';
import { calculatePlayerStats } from '@/lib/pairingGenerator';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportUtils';

const History = () => {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  useEffect(() => {
    setSessions(loadHistory());
  }, []);

  const handleDelete = (sessionId: string) => {
    deleteFromHistory(sessionId);
    setSessions(loadHistory());
    toast.success('Training aus Historie gelöscht');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatShortDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const groupMatchesByRound = (matches: Match[]) => {
    return matches.reduce((acc, match) => {
      if (!acc[match.round]) acc[match.round] = [];
      acc[match.round].push(match);
      return acc;
    }, {} as Record<number, Match[]>);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl md:text-3xl flex items-center gap-2">
            <HistoryIcon className="w-7 h-7 text-primary" />
            Trainings-Historie
          </h1>
        </div>

        {sessions.length === 0 ? (
          <Card className="animate-fade-in">
            <CardContent className="py-16 text-center">
              <HistoryIcon className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">
                Noch keine abgeschlossenen Trainings in der Historie
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => {
              const stats = calculatePlayerStats(session.players, session.matches);
              const winner = stats[0]?.player.name || 'Unbekannt';
              
              return (
                <Card key={session.id} className="animate-fade-in hover:shadow-glow transition-shadow">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="font-semibold">{formatDate(session.date)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {session.players.length} Spieler
                          </span>
                          <span>{session.matches.length} Spiele</span>
                          <span>{session.roundCount} Runden</span>
                        </div>
                        <p className="text-sm mt-2">
                          <span className="text-accent font-semibold">Sieger:</span> {winner}
                        </p>
                        {session.transferredToLeagues && session.transferredToLeagues.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            ✓ Übertragen zu {session.transferredToLeagues.length} Liga(en)
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSession(session);
                            setShowDetailDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Details
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              exportTrainingToXLSX(session);
                              toast.success('XLSX exportiert');
                            }}>
                              <FileSpreadsheet className="w-4 h-4 mr-2" />
                              Als XLSX
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              exportTrainingToPDF(session);
                              toast.success('PDF exportiert');
                            }}>
                              <FileText className="w-4 h-4 mr-2" />
                              Als PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Training löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Das Training vom {formatShortDate(session.date)} wird unwiderruflich aus der Historie gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(session.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                {selectedSession && formatDate(selectedSession.date)}
              </DialogTitle>
            </DialogHeader>
            
            {selectedSession && (
              <div className="space-y-6">
                <StandingsTable 
                  stats={calculatePlayerStats(selectedSession.players, selectedSession.matches)} 
                  title="Endstand"
                />
                
                <div className="space-y-4">
                  <h3 className="font-display text-lg">Alle Spiele</h3>
                  {Object.entries(groupMatchesByRound(selectedSession.matches)).map(([round, matches]) => (
                    <div key={round} className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground">Runde {round}</h4>
                      {matches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          onUpdateScore={() => {}}
                          readonly
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default History;
