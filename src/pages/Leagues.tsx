import { useState, useEffect } from 'react';
import { Plus, Trophy, Trash2, Calendar, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { StandingsTable } from '@/components/StandingsTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { League } from '@/types';
import { loadLeagues, saveLeagues } from '@/lib/storage';
import { exportLeagueToXLSX, exportLeagueToPDF } from '@/lib/exportUtils';
import { cn } from '@/lib/utils';

const Leagues = () => {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [showNewLeague, setShowNewLeague] = useState(false);

  useEffect(() => {
    const loaded = loadLeagues();
    setLeagues(loaded);
    if (loaded.length > 0) {
      setSelectedLeague(loaded[0]);
    }
  }, []);

  const handleCreateLeague = () => {
    if (!newLeagueName.trim()) return;

    const newLeague: League = {
      id: crypto.randomUUID(),
      name: newLeagueName.trim(),
      year: new Date().getFullYear(),
      playerStats: [],
      createdAt: new Date().toISOString(),
    };

    const updatedLeagues = [...leagues, newLeague];
    setLeagues(updatedLeagues);
    saveLeagues(updatedLeagues);
    setSelectedLeague(newLeague);
    setNewLeagueName('');
    setShowNewLeague(false);
    toast.success(`Liga "${newLeague.name}" erstellt`);
  };

  const handleDeleteLeague = (leagueId: string) => {
    const updatedLeagues = leagues.filter(l => l.id !== leagueId);
    setLeagues(updatedLeagues);
    saveLeagues(updatedLeagues);
    
    if (selectedLeague?.id === leagueId) {
      setSelectedLeague(updatedLeagues[0] || null);
    }
    
    toast.success('Liga gelöscht');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl md:text-3xl flex items-center gap-2">
            <Trophy className="w-7 h-7 text-accent" />
            Ligen
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* League List */}
          <div className="space-y-4">
            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Alle Ligen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {leagues.map((league) => (
                  <button
                    key={league.id}
                    onClick={() => setSelectedLeague(league)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all duration-200",
                      selectedLeague?.id === league.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <p className="font-semibold">{league.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {league.playerStats.length} Spieler
                    </p>
                  </button>
                ))}

                {leagues.length === 0 && !showNewLeague && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    Noch keine Ligen vorhanden
                  </p>
                )}

                {showNewLeague ? (
                  <div className="space-y-2 pt-2">
                    <Input
                      placeholder="Liganame..."
                      value={newLeagueName}
                      onChange={(e) => setNewLeagueName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={handleCreateLeague}
                        disabled={!newLeagueName.trim()}
                      >
                        Erstellen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowNewLeague(false);
                          setNewLeagueName('');
                        }}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => setShowNewLeague(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Neue Liga
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* League Details */}
          <div className="lg:col-span-3">
            {selectedLeague ? (
              <div className="space-y-4">
                <Card className="animate-fade-in">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-2xl">{selectedLeague.name}</CardTitle>
                        <p className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                          <Calendar className="w-4 h-4" />
                          Erstellt am {formatDate(selectedLeague.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                              <Download className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              exportLeagueToXLSX(selectedLeague);
                              toast.success('XLSX exportiert');
                            }}>
                              <FileSpreadsheet className="w-4 h-4 mr-2" />
                              Als XLSX
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              exportLeagueToPDF(selectedLeague);
                              toast.success('PDF exportiert');
                            }}>
                              <FileText className="w-4 h-4 mr-2" />
                              Als PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Liga löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Diese Aktion kann nicht rückgängig gemacht werden. Alle Daten der Liga "{selectedLeague.name}" werden unwiderruflich gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteLeague(selectedLeague.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <StandingsTable
                  stats={selectedLeague.playerStats}
                  title={`Gesamttabelle ${selectedLeague.name}`}
                />
              </div>
            ) : (
              <Card className="animate-fade-in">
                <CardContent className="py-16 text-center">
                  <Trophy className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">
                    Wähle eine Liga aus oder erstelle eine neue
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Leagues;
