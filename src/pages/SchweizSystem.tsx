import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, CheckCircle2, RotateCcw, ChevronDown, ChevronUp,
  Trophy, Users, GitBranch, Settings, ArrowRight, Crown, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { PlayerInput } from '@/components/PlayerInput';
import { SwissMatchCard } from '@/components/SwissMatchCard';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { PlayoffBracket } from '@/components/PlayoffBracket';
import { TransferDialog } from '@/components/TransferDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Player, Match, League } from '@/types';
import {
  SwissSession, SwissConfig, SwissRound, PlayoffMatch,
  SwissEndMode, PlayoffFormat, PlayoffStart,
} from '@/types/swiss';
import {
  computeSwissStats, generateSwissRoundMatches, generateRefereeRound,
  generatePlayoff, advancePlayoffBracket, getPlayoffWinner, getRoundName,
} from '@/lib/swissPairing';
import { playoffResultError } from '@/lib/tournamentPhases';
import { sessionFinalRanking } from '@/lib/swissRanking';
import { FinalRankingTable } from '@/components/FinalRankingTable';
import { SaveStatusBadge } from '@/components/SaveStatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayerRegistry } from '@/hooks/usePlayerRegistry';
import {
  loadLeagues, loadLeague, saveLeagueHeader, saveLeagueRows, swissStateSupported, loadRunningSwissSession, saveSwissSession, discardSwissSession,
} from '@/lib/storage';
import { useSwissAutosave, findRestorableSwissBackup, clearSwissBackup, announceRestored } from '@/hooks/useSwissAutosave';
import { maxSwissRounds, PairingBudgetError, SwissPairingError } from '@/lib/swissPairingEngine';
import { applySessionToLeague, changedRows, NameMatchesByLeague } from '@/lib/leagueTransfer';
import { sameName } from '@/lib/nameMatching';
import { cn } from '@/lib/utils';
import { pluralize } from '@/lib/plural';
import { handleExportXLSX, handleExportPDF, persistSwissToHistory, convertSwissToTrainingSession, computeFinalSwissStats } from '@/pages/swissHelpers';

const STORAGE_KEY = 'swiss-session-v1';

function saveSwissToDevice(s: SwissSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function loadSwissFromDevice(): SwissSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SwissSession) : null;
  } catch {
    return null;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function SchweizSystem() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const { registry, addPlayer: createKnownPlayer } = usePlayerRegistry(isAdmin);

  // 'db': the running tournament lives in the database; 'local': the database cannot hold it yet (migration missing),
  // it stays in this browser as before
  const [storageMode, setStorageMode] = useState<'loading' | 'db' | 'local'>('loading');
  const [loadError, setLoadError] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<SwissSession | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [expandedRounds, setExpandedRounds] = useState<string[]>([]);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'rounds' | 'standings' | 'playoff'>('rounds');

  // Config state (only used before session starts)
  const [config, setConfig] = useState<SwissConfig>({
    rounds: 4,
    refereeMode: false,
    endMode: 'direct',
    playoffFormat: 'standard',
    playoffStart: 'qf',
  });

  const saveToDb = useCallback((s: SwissSession) => saveSwissSession(convertSwissToTrainingSession(s), s), []);
  const autosave = useSwissAutosave(session, isAdmin && storageMode === 'db', saveToDb);
  const { markSaved, afterNextSave, closeSession, reopenSession } = autosave;

  const expandIncomplete = (saved: SwissSession) => {
    const roundKeys = saved.rounds.flatMap(r =>
      r.pass ? [`${r.roundNumber}-${r.pass}`] : [`${r.roundNumber}`]
    );
    const incomplete = roundKeys.filter(k => {
      const [rn, pass] = k.split('-').map(Number);
      const round = saved.rounds.find(r =>
        r.roundNumber === rn && (pass ? r.pass === pass : true)
      );
      return round && !round.isCompleted;
    });
    setExpandedRounds(incomplete.length > 0 ? [incomplete[0]] : []);
  };

  const showSession = (s: SwissSession) => {
    setSession(s);
    setPlayers(s.players);
    expandIncomplete(s);
  };

  // Load the running tournament (once the login state is known: only an admin may import a tournament from the device)
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const supported = await swissStateSupported();
        if (cancelled) return;
        const device = loadSwissFromDevice();

        if (!supported) {
          // Database cannot hold it yet: keep it in the browser, as before
          setStorageMode('local');
          if (device) showSession(device);
          return;
        }

        const server = await loadRunningSwissSession();
        if (cancelled) return;
        // Changes that never reached the server (connection lost, tab closed) are restored
        const restored = findRestorableSwissBackup(server);
        let current = restored ?? server;
        markSaved(restored ? null : server);
        if (restored) announceRestored();

        if (device && isAdmin) {
          if (!current) {
            // A tournament that so far only existed on this device: move it to the database. The old copy is removed
            // only after the server confirmed the save, nothing is deleted before.
            current = device;
            markSaved(null);
            afterNextSave(() => {
              try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
              toast.success('Turnier vom Gerät übernommen und in der Datenbank gespeichert.');
            });
          } else if (JSON.stringify(device) === JSON.stringify(server)) {
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
          } else {
            // Different from what the server has: the server version wins, the device copy is kept under its own key
            try {
              localStorage.setItem(`${STORAGE_KEY}-conflict-${new Date().toISOString().slice(0, 10)}`, JSON.stringify(device));
              localStorage.removeItem(STORAGE_KEY);
            } catch { /* ignore */ }
            toast.warning('Auf diesem Gerät lag eine abweichende Fassung des Turniers. Es gilt die gespeicherte Fassung; die Gerätefassung bleibt gesichert.');
          }
        }

        setStorageMode('db');
        if (current) showSession(current);
      } catch (err) {
        // Never show the empty start form after a failed load: starting a new tournament would hide the running one
        console.error('Failed to load the Swiss tournament:', err);
        if (!cancelled) {
          setLoadError(true);
          toast.error('Das Turnier konnte nicht geladen werden');
        }
      }
    })();
    loadLeagues()
      .then(setLeagues)
      .catch(err => {
        console.error('Failed to load leagues:', err);
        toast.error('Die Ligen konnten nicht geladen werden');
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  // Without the database column the tournament stays in this browser
  useEffect(() => { if (storageMode === 'local') saveSwissToDevice(session); }, [session, storageMode]);

  // ─── Player management ────────────────────────────────────────────────

  const handleAddPlayer = (name: string, ref?: string) => {
    if (players.some(p => sameName(p.name, name) || (ref && p.ref === ref))) {
      toast.error('Spieler existiert bereits');
      return;
    }
    // A known player keeps its fixed id on every evening; free text gets an id of its own as before
    setPlayers(prev => [...prev, { id: ref ?? crypto.randomUUID(), name, ...(ref ? { ref } : {}) }]);
  };

  const handleRemovePlayer = (id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  };

  // ─── Session start ────────────────────────────────────────────────────

  const handleStartSession = () => {
    if (players.length < 2) { toast.error('Mindestens 2 Spieler benötigt'); return; }
    if (players.length < 4 && config.refereeMode) {
      toast.error('Schiedsrichter-Modus benötigt mindestens 4 Spieler');
      return;
    }

    // More rounds than players can meet cannot be drawn without a rematch (R7): the number is limited
    const maxRounds = Math.min(10, maxSwissRounds(players.length));
    const rounds = Math.min(config.rounds, maxRounds);
    if (rounds < config.rounds) {
      toast.info(`Die Rundenzahl wurde auf ${rounds} begrenzt: Mehr Runden sind mit ${players.length} Spielern ohne Wiederholung nicht möglich.`);
    }

    const newSession: SwissSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      config: { ...config, rounds },
      players: [...players],
      rounds: [],
      currentRound: 0,
      isCompleted: false,
      // The lot is drawn once and kept with the tournament: last criterion of the standings (docs/UMSETZUNGSPLAN.md 6.6)
      lot: Object.fromEntries(players.map(p => [p.id, Math.random()])),
    };

    // Generate round 1
    const sessionWithR1 = tryAdvance(newSession);
    if (!sessionWithR1) return;
    setSession(sessionWithR1);   // the draw already expanded the new round (its key is "1" or "1-1" in referee mode)
    toast.success(`Schweizer System gestartet – ${pluralize(rounds, 'Runde', 'Runden')} geplant`);
  };

  // ─── Generate next round ──────────────────────────────────────────────

  function advanceToNextRound(s: SwissSession): SwissSession {
    const nextRoundNumber = s.currentRound + 1;
    let newRounds: SwissRound[];

    // The bye is read from the rounds (byePlayerId), there is no separate flag on the player that could get out of step
    if (s.config.refereeMode) {
      const { pass1, pass2 } = generateRefereeRound(s.players, s.rounds, nextRoundNumber, s.config.rounds, Math.random, s.lot);
      newRounds = [...s.rounds, pass1, pass2];
      setExpandedRounds([`${nextRoundNumber}-1`]);
    } else {
      const { matches, byePlayerId } = generateSwissRoundMatches(s.players, s.rounds, nextRoundNumber, s.config.rounds, Math.random, s.lot);
      const round: SwissRound = {
        roundNumber: nextRoundNumber,
        phase: 'swiss',
        matches,
        isCompleted: false,
        byePlayerId,
      };
      newRounds = [...s.rounds, round];
      setExpandedRounds([`${nextRoundNumber}`]);
    }
    return { ...s, rounds: newRounds, currentRound: nextRoundNumber };
  }

  /** Draws the next round; when that is impossible a message is shown and the tournament stays as it was. */
  function tryAdvance(s: SwissSession): SwissSession | null {
    try {
      return advanceToNextRound(s);
    } catch (err) {
      console.error('Drawing the next round failed:', err);
      if (err instanceof SwissPairingError) toast.error(err.message);
      else if (err instanceof PairingBudgetError) toast.error('Die Auslosung hat zu lange gedauert. Bitte die Rundenzahl prüfen.');
      else toast.error('Die Runde konnte nicht ausgelost werden.');
      return null;
    }
  }

  // Remove current round (only allowed if no matches completed in this round)
  const handleRemoveCurrentRound = () => {
    if (!session) return;
    const cur = session.currentRound;
    if (cur === 0) { toast.error('Keine Runde zum Entfernen'); return; }

    const roundSegments = session.rounds.filter(r => r.roundNumber === cur);
    const anyCompleted = roundSegments.some(seg => seg.matches.some(m => m.isCompleted));
    if (anyCompleted) { toast.error('Runde enthält bereits Ergebnisse und kann nicht entfernt werden'); return; }

    // confirm
    if (!confirm(`Runde ${cur} wirklich entfernen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;

    // The bye of the removed round goes with it: byes are read from the rounds
    const remaining = session.rounds.filter(r => r.roundNumber !== cur);

    setSession(prev => prev ? { ...prev, rounds: remaining, currentRound: Math.max(0, prev.currentRound - 1) } : prev);
    toast.success(`Runde ${cur} entfernt`);
  };

  // ─── Score update ─────────────────────────────────────────────────────

  const handleUpdateScore = (matchId: string, homeScore: number, awayScore: number) => {
    if (!session) return;

    const updatedRounds = session.rounds.map(round => ({
      ...round,
      matches: round.matches.map(m =>
        m.id === matchId ? { ...m, homeScore, awayScore, isCompleted: true } : m
      ),
    }));

    // Re-check if the round is now complete
    const finalRounds = updatedRounds.map(r => ({
      ...r,
      isCompleted: r.matches.length > 0 && r.matches.every(m => m.isCompleted),
    }));

    setSession(prev => prev ? { ...prev, rounds: finalRounds } : prev);
    toast.success('Ergebnis gespeichert');
  };

  // ─── Advance round ────────────────────────────────────────────────────

  const handleAdvanceRound = () => {
    if (!session) return;
    if (session.currentRound >= session.config.rounds) {
      // All Swiss rounds done
      if (session.config.endMode === 'playoff') {
        handleStartPlayoff();
      } else {
        handleCompleteSession();
      }
      return;
    }
    const updated = tryAdvance(session);
    if (!updated) return;
    setSession(updated);
    toast.success(`Runde ${updated.currentRound} gestartet`);
  };

  // ─── Playoff ──────────────────────────────────────────────────────────

  const handleStartPlayoff = () => {
    if (!session) return;
    const stats = computeSwissStats(session.players, session.rounds, session.lot);
    const playoffMatches = generatePlayoff(
      stats,
      session.config.playoffFormat ?? 'standard',
      session.config.playoffStart ?? 'qf',
    );
    const advanced = advancePlayoffBracket(playoffMatches);
    setSession(prev => prev ? { ...prev, playoffMatches: advanced, playoffActive: true } : prev);
    setActiveTab('playoff');
    toast.success('Playoff-Phase gestartet!');
  };

  const handleUpdatePlayoffScore = (matchId: string, homeScore: number, awayScore: number, suddenDeath: boolean) => {
    if (!session?.playoffMatches) return;
    // A knock-out game has no draw; the card checks this too, this keeps other callers honest
    const error = playoffResultError(homeScore, awayScore, suddenDeath);
    if (error) { toast.error(error); return; }
    const updated = session.playoffMatches.map(m =>
      m.id === matchId ? { ...m, homeScore, awayScore, isCompleted: true, suddenDeath } : m
    );
    const advanced = advancePlayoffBracket(updated);
    setSession(prev => prev ? { ...prev, playoffMatches: advanced } : prev);
    toast.success('Playoff-Ergebnis gespeichert');
  };

  // ─── Complete session ─────────────────────────────────────────────────

  const handleCompleteSession = () => {
    const allSwissDone = session?.rounds.every(r => r.isCompleted) ?? false;
    if (!allSwissDone) { toast.error('Es gibt noch offene Spiele'); return; }
    setShowTransferDialog(true);
  };

  const handleTransferResults = async (leagueIds: string[], nameMatches: NameMatchesByLeague) => {
    if (!session) return;
    // Final results: Vorrunde + Playoff-Spiele; Titel aus dem Playoff-Finale (falls gespielt)
    const { stats, championName: firstPlace, viceChampionName: secondPlace } = computeFinalSwissStats(session);

    // Leagues that already received this tournament (an earlier attempt stopped halfway) are skipped
    const alreadyDone = session.transferredToLeagues ?? [];
    const targetIds = leagueIds.filter(id => !alreadyDone.includes(id));

    // The same booking as for a training evening (shared function): the eternal table only gets points and championships
    // League by league: read the league fresh from the database, book the evening on it and write only the rows that
    // changed. The browser state is not used for the numbers, so a second device cannot be overwritten or lose rows.
    // After each league the evening is marked as transferred to it, so a failure never counts it twice.
    let currentLeagues = leagues;
    let currentSession = session;
    for (const leagueId of targetIds) {
      const leagueName = leagues.find(l => l.id === leagueId)?.name ?? '';
      let league: League;
      try {
        const fresh = await loadLeague(leagueId);
        if (!fresh) throw new Error('league not found');
        league = applySessionToLeague(fresh, stats, firstPlace, secondPlace, nameMatches.get(leagueId) ?? new Map());
        await saveLeagueRows(league, changedRows(fresh, league));
      } catch (err) {
        console.error('Failed to save league:', err);
        toast.error(
          `Übertragung zu "${leagueName}" fehlgeschlagen. Bitte erneut versuchen – bereits übertragene Ligen werden nicht doppelt gezählt.`
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

    // Complete the tournament. Autosaving of this tournament stops first, so that an older state cannot overwrite it.
    closeSession(currentSession.id);
    const savedToHistory = await persistSwissToHistory({
      ...currentSession,
      transferredToLeagues: [...new Set([...alreadyDone, ...leagueIds])],
    });
    if (!savedToHistory) {
      reopenSession();
      toast.error('Die Ligen sind aktualisiert, aber der Abend wurde nicht abgeschlossen. Bitte die Übertragung erneut starten – die Ligen werden nicht doppelt gezählt.');
      return;
    }
    clearSwissBackup();
    saveSwissToDevice(null);
    setSession(null);
    setPlayers([]);
    toast.success(`Ergebnisse zu ${leagueIds.length} Liga(en) übertragen`);
  };

  const handleCreateLeague = async (name: string) => {
    const newLeague: League = {
      id: crypto.randomUUID(), name, year: new Date().getFullYear(),
      playerStats: [], createdAt: new Date().toISOString(),
    };
    try {
      await saveLeagueHeader(newLeague);
    } catch (err) {
      console.error('Failed to create league:', err);
      toast.error('Die Liga konnte nicht gespeichert werden. Bitte erneut versuchen.');
      return;
    }
    setLeagues([...leagues, newLeague]);
    toast.success(`Liga "${name}" erstellt`);
  };

  const handleResetSession = async () => {
    if (session && storageMode === 'db') {
      // Nothing is deleted: the running state is cleared, the evening with its players and matches stays in the database
      closeSession(session.id);
      try {
        await discardSwissSession(session.id);
      } catch (err) {
        console.error('Failed to reset the Swiss tournament:', err);
        reopenSession();
        toast.error('Das Turnier konnte nicht zurückgesetzt werden. Bitte erneut versuchen.');
        return;
      }
      clearSwissBackup();
    }
    saveSwissToDevice(null);
    setSession(null);
    setPlayers([]);
    toast.info('Schweizer System zurückgesetzt');
  };

  // ─── Derived state ────────────────────────────────────────────────────

  const stats = session ? computeSwissStats(session.players, session.rounds, session.lot) : [];

  // Most rounds without a rematch (R7); the slider and the start follow the number of players
  const maxRounds = Math.max(1, Math.min(10, maxSwissRounds(players.length)));
  const roundsValue = Math.min(config.rounds, maxRounds);

  const currentRoundData = session?.rounds.filter(r => r.roundNumber === session.currentRound) ?? [];
  const currentRoundComplete = currentRoundData.length > 0 && currentRoundData.every(r => r.isCompleted);
  const allSwissComplete = session ? session.currentRound >= session.config.rounds && currentRoundComplete : false;

  const playoffFinalMatch = session?.playoffMatches?.find(m => m.round === 1);
  const playoffChampion = playoffFinalMatch ? getPlayoffWinner(playoffFinalMatch) : null;

  // Final ranking (SO § 9 Abs. 6) once the final is decided
  const finalRanking = session && playoffChampion ? sessionFinalRanking(convertSwissToTrainingSession(session)) : null;

  // Transfer stats: finale Ergebnisse (Vorrunde + Playoff)
  const transferStats = session ? computeFinalSwissStats(session).stats : [];

  // ─── Render ──────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-8">
          <div className="mx-auto max-w-md space-y-4 py-16 text-center">
            <p className="font-medium text-destructive">Das Turnier konnte nicht geladen werden.</p>
            <p className="text-sm text-muted-foreground">
              Es wurde nichts verändert. Bitte Verbindung prüfen und erneut laden.
            </p>
            <Button onClick={() => window.location.reload()}>Erneut laden</Button>
          </div>
        </main>
      </div>
    );
  }

  if (storageMode === 'loading') {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-8">
          <p className="text-muted-foreground text-center py-16">Lade Daten...</p>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-8">
          <div className="flex items-center gap-3 mb-6">
            <GitBranch className="w-7 h-7 text-primary" />
            <h1 className="font-display text-2xl md:text-3xl">Schweizer System</h1>
          </div>

          {isAdmin ? (
            <div className="space-y-6 max-w-2xl mx-auto">
              <PlayerInput
                players={players}
                onAddPlayer={handleAddPlayer}
                onRemovePlayer={handleRemovePlayer}
                registry={registry}
                onCreatePlayer={createKnownPlayer}
              />

              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Konfiguration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Rounds slider */}
                  <div className="space-y-2">
                    <Label>Anzahl Runden: <span className="text-primary font-bold">{roundsValue}</span></Label>
                    <Slider
                      min={1} max={maxRounds} step={1}
                      value={[roundsValue]}
                      onValueChange={([v]) => setConfig(c => ({ ...c, rounds: v }))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1</span><span>{maxRounds}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Empfehlung: ⌈log₂(n)⌉ = {pluralize(Math.min(maxRounds, Math.ceil(Math.log2(Math.max(players.length, 2)))), 'Runde', 'Runden')} für {pluralize(players.length, 'Spieler', 'Spieler')}.
                      Mehr als {pluralize(maxRounds, 'Runde', 'Runden')} sind mit {pluralize(players.length, 'Spieler', 'Spielern')} ohne Wiederholung nicht möglich.
                    </p>
                  </div>

                  {/* Referee mode */}
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <Label className="text-base font-semibold">Schiedsrichter-Modus</Label>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Jede Runde hat zwei Durchgänge – Spieler wechseln zwischen Spielen und Schiedsrichten
                      </p>
                    </div>
                    <Switch
                      checked={config.refereeMode}
                      onCheckedChange={v => setConfig(c => ({ ...c, refereeMode: v }))}
                    />
                  </div>

                  {/* End mode */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">End-Modus</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['direct', 'playoff'] as SwissEndMode[]).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setConfig(c => ({ ...c, endMode: mode }))}
                          className={cn(
                            'p-4 rounded-lg border-2 transition-all text-left',
                            config.endMode === mode
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50',
                          )}
                        >
                          <div className="font-semibold text-sm">
                            {mode === 'direct' ? '🏁 Direktes Ende' : '🏆 Playoff-Phase'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {mode === 'direct'
                              ? 'Rangliste nach dem Schweizer System'
                              : 'KO-Runden nach dem Schweizer System'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Playoff options */}
                  {config.endMode === 'playoff' && (
                    <div className="space-y-4 pl-4 border-l-2 border-primary/30 animate-fade-in">
                      <div className="space-y-2">
                        <Label>Playoff-Format</Label>
                        <Select
                          value={config.playoffFormat}
                          onValueChange={v => setConfig(c => ({ ...c, playoffFormat: v as PlayoffFormat }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="progressive">Progressiv (24/16/12 Teilnehmer)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Start ab</Label>
                        <Select
                          value={config.playoffStart}
                          onValueChange={v => setConfig(c => ({ ...c, playoffStart: v as PlayoffStart }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="r16">Achtelfinale (Top 16)</SelectItem>
                            <SelectItem value="qf">Viertelfinale (Top 8)</SelectItem>
                            <SelectItem value="sf">Halbfinale (Top 4)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Top-platzierte Spieler erhalten Freilose (Byes) und steigen erst in späteren Runden ein.
                        </p>
                      </div>
                    </div>
                  )}
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
                Schweizer System starten
              </Button>
            </div>
          ) : (
            <Card className="animate-fade-in max-w-2xl mx-auto">
              <CardContent className="py-16 text-center">
                <GitBranch className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground mb-2">Kein aktives Turnier</p>
                <p className="text-sm text-muted-foreground">Bitte als Admin einloggen.</p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  // ─── Active session UI ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6 md:py-8">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <GitBranch className="w-7 h-7 text-primary" />
            <div>
              <h1 className="font-display text-2xl">Schweizer System</h1>
              <p className="text-sm text-muted-foreground">
                Runde {session.currentRound} / {session.config.rounds}
                {session.config.refereeMode && ' · Schiedsrichter-Modus'}
                {session.playoffActive && ' · Playoff'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {allSwissComplete && !session.playoffActive && session.config.endMode === 'playoff' && (
                <Button variant="accent" size="sm" onClick={handleStartPlayoff} className="gap-2">
                  <Trophy className="w-4 h-4" />
                  Playoff starten
                </Button>
              )}
              {allSwissComplete && !session.playoffActive && session.config.endMode === 'direct' && (
                <Button variant="accent" size="sm" onClick={handleCompleteSession} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Abschließen
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleResetSession}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Zurücksetzen
              </Button>
              {session.currentRound > 0 && (
                <Button variant="destructive" size="sm" onClick={handleRemoveCurrentRound}>
                  Runde entfernen
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => handleExportXLSX(session)}>
                Export XLSX
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportPDF(session)}>
                Export PDF
              </Button>
              {storageMode === 'local' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => persistSwissToHistory(session)}
                >
                  In Historie speichern
                </Button>
              )}
            </div>
          )}
        </div>

        {isAdmin && storageMode === 'db' && <SaveStatusBadge status={autosave.status} onRetry={autosave.retry} />}
        {isAdmin && storageMode === 'local' && (
          <p role="note" className="mb-4 text-xs text-muted-foreground">
            Turnier wird nur auf diesem Gerät gespeichert.
          </p>
        )}

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex gap-1">
            {Array.from({ length: session.config.rounds }, (_, i) => {
              const roundDone = session.rounds
                .filter(r => r.roundNumber === i + 1)
                .every(r => r.isCompleted);
              const isActive = i + 1 === session.currentRound;
              return (
                <div
                  key={i}
                  className={cn(
                    'flex-1 h-2 rounded-full transition-all',
                    roundDone ? 'bg-primary' : isActive ? 'bg-primary/40' : 'bg-muted',
                  )}
                />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {session.rounds.filter(r => r.isCompleted).length} von {session.config.rounds * (session.config.refereeMode ? 2 : 1)} Durchgängen abgeschlossen
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="rounds" className="gap-1">
              <Play className="w-4 h-4" /> Runden
            </TabsTrigger>
            <TabsTrigger value="standings" className="gap-1">
              <Trophy className="w-4 h-4" /> Rangliste
            </TabsTrigger>
            {(session.playoffActive || session.config.endMode === 'playoff') && (
              <TabsTrigger value="playoff" className="gap-1">
                <GitBranch className="w-4 h-4" /> Playoff
                {session.playoffActive && (
                  <Badge variant="secondary" className="ml-1 text-xs">Aktiv</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Rounds Tab ── */}
          <TabsContent value="rounds" className="space-y-4">
            {/* Group rounds by roundNumber */}
            {Array.from(
              new Set(session.rounds.map(r => r.roundNumber))
            ).map(roundNum => {
              const roundSegments = session.rounds.filter(r => r.roundNumber === roundNum);

              return (
                <div key={roundNum} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg">Runde {roundNum}</h2>
                    {roundSegments.every(r => r.isCompleted) && (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    )}
                  </div>

                  {roundSegments.map(segment => {
                    const key = segment.pass
                      ? `${segment.roundNumber}-${segment.pass}`
                      : `${segment.roundNumber}`;
                    const isExpanded = expandedRounds.includes(key);
                    const segComplete = segment.isCompleted;

                    return (
                      <Card key={key} className="animate-fade-in">
                        <button
                          onClick={() =>
                            setExpandedRounds(prev =>
                              prev.includes(key)
                                ? prev.filter(k => k !== key)
                                : [...prev, key]
                            )
                          }
                          className="w-full p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors rounded-t-xl"
                        >
                          <div className="flex items-center gap-3">
                            <span className={cn('font-semibold', segComplete && 'text-primary')}>
                              {segment.pass
                                ? `Durchgang ${segment.pass} ${segment.pass === 1 ? '(Spieler A)' : '(Spieler B)'}`
                                : `Runde ${roundNum}`}
                            </span>
                            {segComplete && <CheckCircle2 className="w-4 h-4 text-primary" />}
                            {segment.referees && segment.referees.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                SR: {segment.referees.length}
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              ({segment.matches.filter(m => m.isCompleted).length}/{segment.matches.length})
                            </span>
                          </div>
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                        </button>

                        {isExpanded && (
                          <CardContent className="pt-0 space-y-3">
                            {segment.referees && segment.referees.length > 0 && (
                              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg text-sm">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Schiedsrichter: </span>
                                <span className="font-medium">
                                  {segment.referees
                                    .map(id => session.players.find(p => p.id === id)?.name ?? id)
                                    .join(', ')}
                                </span>
                              </div>
                            )}
                            {segment.byePlayerId && (
                              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Spielfrei: </span>
                                <span className="font-medium">
                                  {session.players.find(p => p.id === segment.byePlayerId)?.name ?? '–'}
                                </span>
                                <span className="text-xs text-muted-foreground">(0 Punkte, 0 Tore)</span>
                              </div>
                            )}
                            {segment.matches.length === 0 ? (
                              <p className="text-muted-foreground text-center py-4">Keine Paarungen in diesem Durchgang</p>
                            ) : (
                              segment.matches.map((match, idx) => (
                                <SwissMatchCard
                                  key={match.id}
                                  match={match}
                                  onUpdateScore={handleUpdateScore}
                                  tableNumber={idx + 1}
                                  readonly={!isAdmin}
                                />
                              ))
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}

                  {/* Advance to next round button */}
                  {isAdmin &&
                    roundNum === session.currentRound &&
                    roundSegments.every(r => r.isCompleted) &&
                    session.currentRound < session.config.rounds && (
                      <Button
                        variant="accent"
                        className="w-full gap-2"
                        onClick={handleAdvanceRound}
                      >
                        <ArrowRight className="w-4 h-4" />
                        Runde {session.currentRound + 1} generieren
                      </Button>
                    )}
                </div>
              );
            })}

            {/* All rounds done CTA */}
            {isAdmin && allSwissComplete && (
              <Card className="border-primary/50 bg-primary/5 animate-scale-in">
                <CardContent className="py-6 text-center space-y-3">
                  <Trophy className="w-12 h-12 mx-auto text-primary" />
                  <p className="font-display text-xl">Alle Runden abgeschlossen!</p>
                  {session.config.endMode === 'playoff' && !session.playoffActive ? (
                    <Button variant="accent" size="lg" onClick={handleStartPlayoff} className="gap-2">
                      <GitBranch className="w-5 h-5" />
                      Playoff-Phase starten
                    </Button>
                  ) : (
                    <Button variant="accent" size="lg" onClick={handleCompleteSession} className="gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Turnier abschließen & übertragen
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Standings Tab ── */}
          <TabsContent value="standings">
            <SwissStandingsTable
              stats={stats}
              title="Aktuelle Rangliste"
              highlightTop={
                session.config.playoffStart === 'r16' ? 16
                  : session.config.playoffStart === 'qf' ? 8
                  : 4
              }
            />
            {stats.length > 0 && (
              <div className="mt-4 p-4 bg-secondary/50 rounded-lg text-sm text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Sortierung</p>
                <p>1. Ø Punkte/Spiel · 2. Buchholz-Zahl · 3. Tordifferenz</p>
                {session.config.endMode === 'playoff' && (
                  <p className="text-primary">
                    Die Top {session.config.playoffStart === 'r16' ? 16 : session.config.playoffStart === 'qf' ? 8 : 4} Spieler qualifizieren sich für die Playoffs (hervorgehoben).
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Playoff Tab ── */}
          {(session.playoffActive || session.config.endMode === 'playoff') && (
            <TabsContent value="playoff">
              {session.playoffActive && session.playoffMatches ? (
                <>
                  {playoffChampion && (
                    <Card className="mb-4 border-gold/50 bg-gold/10 animate-scale-in">
                      <CardContent className="py-4 text-center">
                        <Crown className="w-10 h-10 mx-auto text-gold mb-2" />
                        <p className="font-display text-2xl text-gold">{playoffChampion.name}</p>
                        <p className="text-muted-foreground text-sm">🏆 Turniersieger</p>
                      </CardContent>
                    </Card>
                  )}
                  <PlayoffBracket
                    matches={session.playoffMatches}
                    onUpdateScore={handleUpdatePlayoffScore}
                    readonly={!isAdmin}
                  />
                  {finalRanking && (
                    <div className="mt-4">
                      <FinalRankingTable rows={finalRanking} />
                    </div>
                  )}
                  {isAdmin && playoffChampion && (
                    <div className="mt-4">
                      <Button variant="accent" size="lg" className="w-full gap-2" onClick={handleCompleteSession}>
                        <CheckCircle2 className="w-5 h-5" />
                        Turnier abschließen & übertragen
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Card className="animate-fade-in">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p>Die Playoff-Phase startet nach Abschluss aller Schweizer Runden.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </main>

      <TransferDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        leagues={leagues}
        stats={transferStats}
        onTransfer={handleTransferResults}
        onCreateLeague={handleCreateLeague}
        transferredLeagueIds={session?.transferredToLeagues ?? []}
      />
    </div>
  );
}
