import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { PlayerInput } from '@/components/PlayerInput';
import { MatchCard } from '@/components/MatchCard';
import { StandingsTable } from '@/components/StandingsTable';
import { TransferDialog } from '@/components/TransferDialog';
import { SaveStatusBadge } from '@/components/SaveStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Player, TrainingSession, Match, League, PlayerStats } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { generatePairings, calculatePlayerStats } from '@/lib/pairingGenerator';
import { groupMatchesByRound } from '@/lib/tables';
import { useSessionAutosave, findRestorableBackup, clearBackup } from '@/hooks/useSessionAutosave';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportActions';
import {
  loadCurrentSession,
  saveCurrentSession,
  loadLeagues,
  saveLeague,
  saveToHistory,
} from '@/lib/storage';
import { cn } from '@/lib/utils';

const Training = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [matchesPerPairing, setMatchesPerPairing] = useState(1);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [expandedRounds, setExpandedRounds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const { status: saveStatus, retry: retrySave, markSaved, announceOnSave, cancelPending } =
    useSessionAutosave(session, isAdmin);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const savedSession = await loadCurrentSession();
      // Changes that never reached the server (connection lost, tab closed) are restored
      const restored = findRestorableBackup(savedSession);
      const current = restored ?? savedSession;
      markSaved(restored ? null : savedSession);
      if (current) {
        setSession(current);
        setPlayers(current.players);
        const firstIncompleteRound = current.matches.find(m => !m.isCompleted)?.round;
        if (firstIncompleteRound) {
          setExpandedRounds([firstIncompleteRound]);
        }
      }
      if (restored) {
        toast.info('Nicht gespeicherte Änderungen wurden wiederhergestellt und werden jetzt gespeichert.');
      }
    } catch (err) {
      // Never show the empty start form after a failed load: starting a new evening would hide the running one
      console.error('Failed to load the training evening:', err);
      setLoadError(true);
      toast.error('Der Trainingsabend konnte nicht geladen werden');
      setLoading(false);
      return;
    }
    try {
      setLeagues(await loadLeagues());
    } catch (err) {
      console.error('Failed to load leagues:', err);
      toast.error('Die Ligen konnten nicht geladen werden');
    }
    setLoading(false);
  }, [markSaved]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddPlayer = (name: string) => {
    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Spieler existiert bereits');
      return;
    }
    const newPlayer: Player = { id: crypto.randomUUID(), name };
    setPlayers([...players, newPlayer]);
  };

  const handleRemovePlayer = (id: string) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  const handleStartSession = () => {
    if (players.length < 2) {
      toast.error('Mindestens 2 Spieler benötigt');
      return;
    }

    const { matches, roundCount } = generatePairings(players, matchesPerPairing);
    
    const newSession: TrainingSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      players: [...players],
      matches,
      isCompleted: false,
      roundCount,
      matchesPerPairing,
    };

    setSession(newSession);
    setExpandedRounds([1]);
    
    const maxRounds = players.length - 1;
    toast.success(`${matches.length} Spiele in ${roundCount} Runden generiert (Round-Robin: max ${maxRounds} Runden pro Durchgang)`);
  };

  const handleUpdateScore = (matchId: string, homeScore: number, awayScore: number) => {
    if (!session) return;

    const updatedMatches = session.matches.map(m =>
      m.id === matchId
        ? { ...m, homeScore, awayScore, isCompleted: true }
        : m
    );

    setSession({ ...session, matches: updatedMatches });
    announceOnSave('Ergebnis gespeichert');

    const match = session.matches.find(m => m.id === matchId);
    if (match) {
      const roundMatches = updatedMatches.filter(m => m.round === match.round);
      if (roundMatches.every(m => m.isCompleted)) {
        const nextRound = match.round + 1;
        if (nextRound <= session.roundCount) {
          setExpandedRounds(prev => [...prev.filter(r => r !== match.round), nextRound]);
        }
      }
    }
  };

  const handleCompleteSession = () => {
    if (!session) return;

    const incompleteMatches = session.matches.filter(m => !m.isCompleted);
    if (incompleteMatches.length > 0) {
      toast.error(`Noch ${incompleteMatches.length} Spiele offen`);
      return;
    }

    setShowTransferDialog(true);
  };

  const handleTransferResults = async (leagueIds: string[], nameMatches: Map<string, string>) => {
    if (!session) return;

    const stats = calculatePlayerStats(session.players, session.matches);
    
    const firstPlace = stats[0]?.player.name;
    const secondPlace = stats[1]?.player.name;
    
    // Leagues that already received this evening (an earlier attempt stopped halfway) are skipped
    const alreadyDone = session.transferredToLeagues ?? [];
    const targetIds = leagueIds.filter(id => !alreadyDone.includes(id));

    const updatedLeagues = leagues.map(league => {
      if (!targetIds.includes(league.id)) return league;

      const updatedStats = [...league.playerStats];

      if (league.isEternal) {
        // Eternal league: add points + pointsAgainst like normal leagues, +1 championship for 1st place
        stats.forEach(stat => {
          const mappedName = nameMatches.get(stat.player.name);
          const searchName = mappedName || stat.player.name;

          const existingIndex = updatedStats.findIndex(
            s => s.player.name.toLowerCase() === searchName.toLowerCase()
          );

          const isChamp = stat.player.name === firstPlace;

          if (existingIndex >= 0) {
            const existing = updatedStats[existingIndex];
            updatedStats[existingIndex] = {
              ...existing,
              points: existing.points + stat.points,
              pointsAgainst: (existing.pointsAgainst || 0) + stat.pointsAgainst,
              championships: (existing.championships || 0) + (isChamp ? 1 : 0),
            };
          } else {
            updatedStats.push({
              ...stat,
              wins: 0, draws: 0, losses: 0,
              goalsFor: 0, goalsAgainst: 0,
              goalDifference: 0,
              championships: isChamp ? 1 : 0,
              viceChampionships: 0,
            });
          }
        });

        updatedStats.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return (b.championships ?? 0) - (a.championships ?? 0);
        });
      } else {
        // Normal league: full stats transfer
        stats.forEach(stat => {
          const mappedName = nameMatches.get(stat.player.name);
          const searchName = mappedName || stat.player.name;

          const existingIndex = updatedStats.findIndex(
            s => s.player.name.toLowerCase() === searchName.toLowerCase()
          );

          if (existingIndex >= 0) {
            const existing = updatedStats[existingIndex];
            updatedStats[existingIndex] = {
              ...existing,
              wins: existing.wins + stat.wins,
              draws: existing.draws + stat.draws,
              losses: existing.losses + stat.losses,
              goalsFor: existing.goalsFor + stat.goalsFor,
              goalsAgainst: existing.goalsAgainst + stat.goalsAgainst,
              points: existing.points + stat.points,
              pointsAgainst: existing.pointsAgainst + stat.pointsAgainst,
              goalDifference: existing.goalDifference + stat.goalDifference,
              championships: (existing.championships || 0) + (stat.player.name === firstPlace ? 1 : 0),
              viceChampionships: (existing.viceChampionships || 0) + (stat.player.name === secondPlace ? 1 : 0),
            };
          } else {
            updatedStats.push({
              ...stat,
              championships: stat.player.name === firstPlace ? 1 : 0,
              viceChampionships: stat.player.name === secondPlace ? 1 : 0,
            });
          }
        });

        updatedStats.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
          return b.goalsFor - a.goalsFor;
        });
      }

      return { ...league, playerStats: updatedStats };
    });

    // Save league by league. After each league the evening is marked as transferred to it,
    // so a failure never counts the same evening twice when the transfer is repeated.
    let currentLeagues = leagues;
    let currentSession = session;
    for (const league of updatedLeagues.filter(l => targetIds.includes(l.id))) {
      try {
        await saveLeague(league);
      } catch (err) {
        console.error('Failed to save league:', err);
        toast.error(
          `Übertragung zu "${league.name}" fehlgeschlagen. Bitte erneut versuchen – bereits übertragene Ligen werden nicht doppelt gezählt.`
        );
        return;
      }
      currentLeagues = currentLeagues.map(l => (l.id === league.id ? league : l));
      setLeagues(currentLeagues);
      currentSession = {
        ...currentSession,
        transferredToLeagues: [...(currentSession.transferredToLeagues ?? []), league.id],
      };
      setSession(currentSession);
    }

    const completedSession: TrainingSession = {
      ...currentSession,
      isCompleted: true,
      transferredToLeagues: [...new Set([...alreadyDone, ...leagueIds])],
    };

    // Complete the evening. Pending autosaves are dropped first so an older state cannot overwrite it.
    cancelPending();
    try {
      await saveToHistory(completedSession);
      await saveCurrentSession(null);
    } catch (err) {
      console.error('Failed to complete the evening:', err);
      toast.error(
        'Die Ligen sind aktualisiert, aber der Abend konnte nicht abgeschlossen werden. Bitte "Training abschließen" erneut wählen – die Ligen werden nicht doppelt gezählt.'
      );
      return;
    }

    clearBackup();
    setSession(null);
    setPlayers([]);

    toast.success(`Ergebnisse zu ${leagueIds.length} Liga(en) übertragen`);
  };

  const handleCreateLeague = async (name: string) => {
    const newLeague: League = {
      id: crypto.randomUUID(),
      name,
      year: new Date().getFullYear(),
      playerStats: [],
      createdAt: new Date().toISOString(),
    };
    
    try {
      await saveLeague(newLeague);
    } catch (err) {
      console.error('Failed to create league:', err);
      toast.error('Die Liga konnte nicht gespeichert werden. Bitte erneut versuchen.');
      return;
    }
    setLeagues([...leagues, newLeague]);
    toast.success(`Liga "${name}" erstellt`);
  };

  const handleResetSession = async () => {
    cancelPending();
    try {
      await saveCurrentSession(null);
    } catch (err) {
      console.error('Failed to reset the evening:', err);
      toast.error('Zurücksetzen fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.');
      return;
    }
    clearBackup();
    setSession(null);
    setPlayers([]);
    toast.info('Trainingsabend zurückgesetzt');
  };

  const toggleRound = (round: number) => {
    setExpandedRounds(prev =>
      prev.includes(round)
        ? prev.filter(r => r !== round)
        : [...prev, round]
    );
  };

  const stats = session ? calculatePlayerStats(session.players, session.matches) : [];
  const matchesByRound = session ? groupMatchesByRound(session.matches) : {};

  const allMatchesComplete = session?.matches.every(m => m.isCompleted) ?? false;

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-8">
          <div className="mx-auto max-w-md space-y-4 py-16 text-center">
            <p className="font-medium text-destructive">Der Trainingsabend konnte nicht geladen werden.</p>
            <p className="text-sm text-muted-foreground">
              Es wurde nichts verändert. Bitte Verbindung prüfen und erneut laden.
            </p>
            <Button onClick={loadData}>Erneut laden</Button>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-8">
          <p className="text-muted-foreground text-center py-16">Lade Daten...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl md:text-3xl">
            {session ? 'Trainingsabend' : 'Neues Training'}
          </h1>
          {session && isAdmin && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={async () => {
                    if (await exportTrainingToXLSX(session)) toast.success('XLSX exportiert');
                  }}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Als XLSX
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    if (await exportTrainingToPDF(session)) toast.success('PDF exportiert');
                  }}>
                    <FileText className="w-4 h-4 mr-2" />
                    Als PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={handleResetSession}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Zurücksetzen
              </Button>
            </div>
          )}
        </div>

        {isAdmin && session && <SaveStatusBadge status={saveStatus} onRetry={retrySave} />}

        {!session ? (
          <div className="space-y-6 max-w-2xl mx-auto">
            {isAdmin ? (
              <>
                <PlayerInput
                  players={players}
                  onAddPlayer={handleAddPlayer}
                  onRemovePlayer={handleRemovePlayer}
                />

                <Card className="animate-fade-in">
                  <CardHeader>
                    <CardTitle>Einstellungen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="matchesPerPairing">Spiele pro Paarung (Durchgänge)</Label>
                      <Input
                        id="matchesPerPairing"
                        type="number"
                        min="1"
                        max="4"
                        value={matchesPerPairing}
                        onChange={(e) => setMatchesPerPairing(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                        className="mt-1 w-24"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Round-Robin: Jeder gegen jeden. Bei {players.length} Spielern = {Math.max(0, players.length - 1)} Runden pro Durchgang.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Button
                  variant="hero"
                  size="xl"
                  className="w-full gap-2"
                  onClick={handleStartSession}
                  disabled={players.length < 2}
                >
                  <Play className="w-5 h-5" />
                  Training starten
                </Button>
              </>
            ) : (
              <Card className="animate-fade-in">
                <CardContent className="py-16 text-center">
                  <Play className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground mb-2">Kein aktives Training</p>
                  <p className="text-sm text-muted-foreground">Bitte als Admin einloggen, um ein Training zu starten.</p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Matches Column */}
            <div className="lg:col-span-2 space-y-4">
              {Object.entries(matchesByRound).map(([round, matches]) => {
                const roundNum = parseInt(round);
                const isExpanded = expandedRounds.includes(roundNum);
                const roundComplete = matches.every(m => m.isCompleted);

                return (
                  <Card key={round} className="animate-fade-in">
                    <button
                      onClick={() => toggleRound(roundNum)}
                      className="w-full p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors rounded-t-xl"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "font-display text-lg",
                          roundComplete && "text-primary"
                        )}>
                          Runde {round}
                        </span>
                        {roundComplete && (
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        )}
                        <span className="text-muted-foreground text-sm">
                          ({matches.filter(m => m.isCompleted).length}/{matches.length})
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    
                    {isExpanded && (
                      <CardContent className="pt-0 space-y-3">
                        {matches.map((match, index) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            onUpdateScore={handleUpdateScore}
                            tableNumber={match.tableNumber ?? index + 1}
                          />
                        ))}
                      </CardContent>
                    )}
                  </Card>
                );
              })}

              {allMatchesComplete && isAdmin && (
                <Button
                  variant="accent"
                  size="xl"
                  className="w-full gap-2"
                  onClick={handleCompleteSession}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Training abschließen
                </Button>
              )}
            </div>

            {/* Standings Column */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <StandingsTable stats={stats} title="Aktuelle Tabelle" />
            </div>
          </div>
        )}
      </main>

      <TransferDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        leagues={leagues}
        stats={stats}
        onTransfer={handleTransferResults}
        onCreateLeague={handleCreateLeague}
        transferredLeagueIds={session?.transferredToLeagues ?? []}
      />
    </div>
  );
};

export default Training;
