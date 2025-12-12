import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { PlayerInput } from '@/components/PlayerInput';
import { MatchCard } from '@/components/MatchCard';
import { StandingsTable } from '@/components/StandingsTable';
import { TransferDialog } from '@/components/TransferDialog';
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
import { generatePairings, calculatePlayerStats } from '@/lib/pairingGenerator';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportUtils';
import {
  loadCurrentSession,
  saveCurrentSession,
  loadSessions,
  saveSessions,
  loadLeagues,
  saveLeagues,
  saveToHistory,
} from '@/lib/storage';
import { cn } from '@/lib/utils';

const Training = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [matchesPerPairing, setMatchesPerPairing] = useState(1);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [expandedRounds, setExpandedRounds] = useState<number[]>([]);

  useEffect(() => {
    const savedSession = loadCurrentSession();
    if (savedSession) {
      setSession(savedSession);
      setPlayers(savedSession.players);
      // Expand first incomplete round
      const firstIncompleteRound = savedSession.matches.find(m => !m.isCompleted)?.round;
      if (firstIncompleteRound) {
        setExpandedRounds([firstIncompleteRound]);
      }
    }
    setLeagues(loadLeagues());
  }, []);

  useEffect(() => {
    if (session) {
      saveCurrentSession(session);
    }
  }, [session]);

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
    
    // Calculate max rounds info
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
    toast.success('Ergebnis gespeichert');

    // Check if round is complete and expand next
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

  const handleTransferResults = (leagueIds: string[], nameMatches: Map<string, string>) => {
    if (!session) return;

    const stats = calculatePlayerStats(session.players, session.matches);
    
    // Find 1st and 2nd place for championship tracking
    const firstPlace = stats[0]?.player.name;
    const secondPlace = stats[1]?.player.name;
    
    const updatedLeagues = leagues.map(league => {
      if (!leagueIds.includes(league.id)) return league;

      const updatedStats = [...league.playerStats];
      
      stats.forEach(stat => {
        // Check if there's a name match mapping
        const mappedName = nameMatches.get(stat.player.name);
        const searchName = mappedName || stat.player.name;
        
        const existingIndex = updatedStats.findIndex(
          s => s.player.name.toLowerCase() === searchName.toLowerCase()
        );

        if (existingIndex >= 0) {
          // Update existing player
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
            // Update championships
            championships: (existing.championships || 0) + (stat.player.name === firstPlace ? 1 : 0),
            viceChampionships: (existing.viceChampionships || 0) + (stat.player.name === secondPlace ? 1 : 0),
          };
        } else {
          // Add new player
          updatedStats.push({
            ...stat,
            championships: stat.player.name === firstPlace ? 1 : 0,
            viceChampionships: stat.player.name === secondPlace ? 1 : 0,
          });
        }
      });

      // Resort standings
      updatedStats.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
      });

      return { ...league, playerStats: updatedStats };
    });

    setLeagues(updatedLeagues);
    saveLeagues(updatedLeagues);

    // Save completed session with transferred leagues info
    const completedSession: TrainingSession = { 
      ...session, 
      isCompleted: true,
      transferredToLeagues: leagueIds,
    };
    
    // Save to history
    saveToHistory(completedSession);
    
    // Also save to sessions for backward compatibility
    const sessions = loadSessions();
    saveSessions([...sessions, completedSession]);
    
    // Clear current session
    saveCurrentSession(null);
    setSession(null);
    setPlayers([]);

    toast.success(`Ergebnisse zu ${leagueIds.length} Liga(en) übertragen`);
  };

  const handleCreateLeague = (name: string) => {
    const newLeague: League = {
      id: crypto.randomUUID(),
      name,
      year: new Date().getFullYear(),
      playerStats: [],
      createdAt: new Date().toISOString(),
    };
    
    const updatedLeagues = [...leagues, newLeague];
    setLeagues(updatedLeagues);
    saveLeagues(updatedLeagues);
    toast.success(`Liga "${name}" erstellt`);
  };

  const handleResetSession = () => {
    saveCurrentSession(null);
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
  const matchesByRound = session
    ? session.matches.reduce((acc, match) => {
        if (!acc[match.round]) acc[match.round] = [];
        acc[match.round].push(match);
        return acc;
      }, {} as Record<number, Match[]>)
    : {};

  const allMatchesComplete = session?.matches.every(m => m.isCompleted) ?? false;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl md:text-3xl">
            {session ? 'Trainingsabend' : 'Neues Training'}
          </h1>
          {session && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
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
              <Button variant="outline" size="sm" onClick={handleResetSession}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Zurücksetzen
              </Button>
            </div>
          )}
        </div>

        {!session ? (
          <div className="space-y-6 max-w-2xl mx-auto">
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
                        {matches.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            onUpdateScore={handleUpdateScore}
                          />
                        ))}
                      </CardContent>
                    )}
                  </Card>
                );
              })}

              {allMatchesComplete && (
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
      />
    </div>
  );
};

export default Training;
