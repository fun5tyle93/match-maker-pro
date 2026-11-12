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
import { usePlayerRegistry } from '@/hooks/usePlayerRegistry';
import { generatePairings } from '@/lib/pairingGenerator';
import { pendingDeciders, rankPlayers, leagueTitleHolders, DeciderResult } from '@/lib/ranking';
import { applySessionToLeague, NameMatchesByLeague } from '@/lib/leagueTransfer';
import { sameName } from '@/lib/nameMatching';
import { DeciderDialog, DeciderGroup } from '@/components/DeciderDialog';
import { groupMatchesByRound, pausingPlayers } from '@/lib/tables';
import { PauseNotice } from '@/components/PauseNotice';
import { pluralize } from '@/lib/plural';
import { useSessionAutosave, findRestorableBackup, clearBackup } from '@/hooks/useSessionAutosave';
import { exportTrainingToXLSX, exportTrainingToPDF } from '@/lib/exportActions';
import {
  loadCurrentSession,
  saveCurrentSession,
  loadLeagues,
  saveLeague,
  saveToHistory,
  defaultRankingRule,
} from '@/lib/storage';
import { cn } from '@/lib/utils';

const Training = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { registry, addPlayer: createKnownPlayer } = usePlayerRegistry(isAdmin);
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [matchesPerPairing, setMatchesPerPairing] = useState(1);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [deciderGroups, setDeciderGroups] = useState<DeciderGroup[] | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [expandedRounds, setExpandedRounds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const { status: saveStatus, retry: retrySave, markSaved, announceOnSave, cancelPending, closeSession, reopenSession } =
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

  const handleAddPlayer = (name: string, ref?: string) => {
    if (players.some(p => sameName(p.name, name) || (ref && p.ref === ref))) {
      toast.error('Spieler existiert bereits');
      return;
    }
    // A known player keeps its fixed id on every evening; free text gets an id of its own as before
    const newPlayer: Player = { id: ref ?? crypto.randomUUID(), name, ...(ref ? { ref } : {}) };
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
      rankingRule: defaultRankingRule(),
    };

    setSession(newSession);
    setExpandedRounds([1]);
    
    const maxRounds = players.length - 1;
    toast.success(
      `${pluralize(matches.length, 'Spiel', 'Spiele')} in ${pluralize(roundCount, 'Runde', 'Runden')} generiert (Round-Robin: max ${pluralize(maxRounds, 'Runde', 'Runden')} pro Durchgang)`
    );
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
      toast.error(`Noch ${pluralize(incompleteMatches.length, 'Spiel', 'Spiele')} offen`);
      return;
    }

    // A complete tie at place 1 or 2 needs a decider first (DTKV rule only; the old rule never has ties)
    const ranked = rankPlayers(session.players, session.matches, session.rankingRule ?? 'legacy', session.deciderResults ?? []);
    const pending = pendingDeciders(ranked);
    if (pending.length > 0) {
      setDeciderGroups(pending);
      return;
    }
    setShowTransferDialog(true);
  };

  const handleDeciderConfirm = (results: DeciderResult[]) => {
    if (!session) return;
    const kept = (session.deciderResults ?? []).filter(old =>
      !results.some(r => r.players.length === old.players.length && r.players.every(id => old.players.includes(id))));
    setSession({ ...session, deciderResults: [...kept, ...results] });
    setDeciderGroups(null);
    setShowTransferDialog(true);
  };

  const handleTransferResults = async (leagueIds: string[], nameMatches: NameMatchesByLeague) => {
    if (!session) return;

    const ranked = rankPlayers(session.players, session.matches, session.rankingRule ?? 'legacy', session.deciderResults ?? []);
    const stats = ranked.stats;

    // Winner and runner-up only when their place is not shared (a tie at place 1 or 2 was decided before)
    const { winner, runnerUp } = leagueTitleHolders(ranked);
    const firstPlace = winner?.name;
    const secondPlace = runnerUp?.name;
    
    // Leagues that already received this evening (an earlier attempt stopped halfway) are skipped
    const alreadyDone = session.transferredToLeagues ?? [];
    const targetIds = leagueIds.filter(id => !alreadyDone.includes(id));

    const updatedLeagues = leagues.map(league =>
      targetIds.includes(league.id) ? applySessionToLeague(league, stats, firstPlace, secondPlace, nameMatches.get(league.id) ?? new Map()) : league,
    );

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

    // Complete the evening. Autosaving of this evening stops first so an older state cannot overwrite it.
    closeSession(currentSession.id);
    try {
      await saveToHistory(completedSession);
      await saveCurrentSession(null);
    } catch (err) {
      reopenSession();
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

  const ranked = session
    ? rankPlayers(session.players, session.matches, session.rankingRule ?? 'legacy', session.deciderResults ?? [])
    : null;
  const stats = ranked?.stats ?? [];
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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
                  registry={registry}
                  onCreatePlayer={createKnownPlayer}
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
                        Round-Robin: Jeder gegen jeden. Bei {pluralize(players.length, 'Spieler', 'Spielern')} = {pluralize(Math.max(0, players.length - 1), 'Runde', 'Runden')} pro Durchgang.
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
                const pausing = pausingPlayers(session.players, matches);

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
                        {pausing.length > 0 && (
                          <span className="hidden sm:inline text-muted-foreground text-sm">
                            · Pause: {pausing.map(p => p.name).join(', ')}
                          </span>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    
                    {isExpanded && (
                      <CardContent className="pt-0 space-y-3 px-3 sm:px-6">
                        {matches.map((match, index) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            onUpdateScore={handleUpdateScore}
                            tableNumber={match.tableNumber ?? index + 1}
                          />
                        ))}
                        <PauseNotice players={pausing} />
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
              <StandingsTable stats={stats} places={ranked?.places} dtkvNote={session?.rankingRule === 'dtkv2026'} title="Aktuelle Tabelle" />
            </div>
          </div>
        )}
      </main>

      <DeciderDialog
        open={deciderGroups !== null}
        groups={deciderGroups ?? []}
        onConfirm={handleDeciderConfirm}
        onCancel={() => setDeciderGroups(null)}
      />

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
