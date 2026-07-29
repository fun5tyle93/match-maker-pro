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
import { useAuth } from '@/contexts/AuthContext';
import { loadLeagues, saveLeagues } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { handleExportXLSX, handleExportPDF, persistSwissToHistory, convertSwissToTrainingSession } from '@/pages/swissHelpers';

const STORAGE_KEY = 'swiss-session-v1';

function saveSwissSession(s: SwissSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function loadSwissSession(): SwissSession | null {
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
  const { isAdmin } = useAuth();

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

  // Load persisted session on mount
  useEffect(() => {
    const saved = loadSwissSession();
    if (saved) {
      setSession(saved);
      setPlayers(saved.players);
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
    }
    loadLeagues().then(setLeagues);
  }, []);

  // Persist session on change
  useEffect(() => { saveSwissSession(session); }, [session]);

  // ─── Player management ────────────────────────────────────────────────

  const handleAddPlayer = (name: string) => {
    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Spieler existiert bereits');
      return;
    }
    setPlayers(prev => [...prev, { id: crypto.randomUUID(), name }]);
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

    const initializedPlayers = players.map(p => ({ ...p, hasHadBye: p.hasHadBye ?? false }));

    const newSession: SwissSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      config: { ...config },
      players: initializedPlayers,
      rounds: [],
      currentRound: 0,
      isCompleted: false,
    };

    // Generate round 1
    const sessionWithR1 = advanceToNextRound(newSession);
    setSession(sessionWithR1);
    setExpandedRounds(['1']);
    toast.success(`Schweizer System gestartet – ${config.rounds} Runden geplant`);
  };

  // ─── Generate next round ──────────────────────────────────────────────

  function advanceToNextRound(s: SwissSession): SwissSession {
    const nextRoundNumber = s.currentRound + 1;
    let newRounds: SwissRound[];

    if (s.config.refereeMode) {
      const { pass1, pass2, byePlayerId } = generateRefereeRound(s.players, s.rounds, nextRoundNumber);
      // Attach byePlayerId to first pass
      if (byePlayerId) pass1.byePlayerId = byePlayerId;
      newRounds = [...s.rounds, pass1, pass2];
      setExpandedRounds([`${nextRoundNumber}-1`]);

      // mark bye on player
      const updatedPlayers = byePlayerId
        ? s.players.map(p => p.id === byePlayerId ? { ...p, hasHadBye: true } : p)
        : s.players;
      return { ...s, rounds: newRounds, currentRound: nextRoundNumber, players: updatedPlayers };
    } else {
      const { matches, byePlayerId } = generateSwissRoundMatches(s.players, s.rounds, nextRoundNumber);
      const round: SwissRound = {
        roundNumber: nextRoundNumber,
        phase: 'swiss',
        matches,
        isCompleted: false,
        byePlayerId,
      };
      newRounds = [...s.rounds, round];
      setExpandedRounds([`${nextRoundNumber}`]);

      const updatedPlayers = byePlayerId
        ? s.players.map(p => p.id === byePlayerId ? { ...p, hasHadBye: true } : p)
        : s.players;
      return { ...s, rounds: newRounds, currentRound: nextRoundNumber, players: updatedPlayers };
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

    const remaining = session.rounds.filter(r => r.roundNumber !== cur);
    // rollback bye flags if needed
    const byePlayers = roundSegments.map(r => r.byePlayerId).filter(Boolean) as string[];
    let updatedPlayers = session.players;
    if (byePlayers.length > 0) {
      updatedPlayers = updatedPlayers.map(p => byePlayers.includes(p.id) ? { ...p, hasHadBye: false } : p);
    }

    setSession(prev => prev ? { ...prev, rounds: remaining, currentRound: Math.max(0, prev.currentRound - 1), players: updatedPlayers } : prev);
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
    const updated = advanceToNextRound(session);
    setSession(updated);
    toast.success(`Runde ${updated.currentRound} gestartet`);
  };

  // ─── Playoff ──────────────────────────────────────────────────────────

  const handleStartPlayoff = () => {
    if (!session) return;
    const stats = computeSwissStats(session.players, session.rounds);
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

  const handleUpdatePlayoffScore = (matchId: string, homeScore: number, awayScore: number) => {
    if (!session?.playoffMatches) return;
    const updated = session.playoffMatches.map(m =>
      m.id === matchId ? { ...m, homeScore, awayScore, isCompleted: true } : m
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

  const handleTransferResults = async (leagueIds: string[], nameMatches: Map<string, string>) => {
    if (!session) return;
    const stats = computeSwissStats(session.players, session.rounds);

    const firstPlace = stats[0]?.player.name;
    const secondPlace = stats[1]?.player.name;

    const updatedLeagues = leagues.map(league => {
      if (!leagueIds.includes(league.id)) return league;
      const updatedStats = [...league.playerStats];

      stats.forEach(stat => {
        const mappedName = nameMatches.get(stat.player.name);
        const searchName = mappedName || stat.player.name;
        const existingIdx = updatedStats.findIndex(
          s => s.player.name.toLowerCase() === searchName.toLowerCase()
        );
        const isChamp = stat.player.name === firstPlace;
        const isVice = stat.player.name === secondPlace;

        if (existingIdx >= 0) {
          const e = updatedStats[existingIdx];
          updatedStats[existingIdx] = {
            ...e,
            wins: e.wins + stat.wins,
            draws: e.draws + stat.draws,
            losses: e.losses + stat.losses,
            goalsFor: e.goalsFor + stat.goalsFor,
            goalsAgainst: e.goalsAgainst + stat.goalsAgainst,
            points: e.points + stat.points,
            pointsAgainst: (e.pointsAgainst ?? 0) + (stat.gamesPlayed * 2 - stat.points),
            goalDifference: e.goalDifference + stat.goalDifference,
            championships: (e.championships ?? 0) + (isChamp ? 1 : 0),
            viceChampionships: (e.viceChampionships ?? 0) + (isVice ? 1 : 0),
          };
        } else {
          updatedStats.push({
            player: stat.player,
            wins: stat.wins,
            draws: stat.draws,
            losses: stat.losses,
            goalsFor: stat.goalsFor,
            goalsAgainst: stat.goalsAgainst,
            points: stat.points,
            pointsAgainst: stat.gamesPlayed * 2 - stat.points,
            goalDifference: stat.goalDifference,
            championships: isChamp ? 1 : 0,
            viceChampionships: isVice ? 1 : 0,
          });
        }
      });

      updatedStats.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
      });

      return { ...league, playerStats: updatedStats };
    });

    setLeagues(updatedLeagues);
    await saveLeagues(updatedLeagues);
    // persist to history
    await persistSwissToHistory(session);
    saveSwissSession(null);
    setSession(null);
    setPlayers([]);
    toast.success(`Ergebnisse zu ${leagueIds.length} Liga(en) übertragen`);
  };

  const handleCreateLeague = async (name: string) => {
    const newLeague: League = {
      id: crypto.randomUUID(), name, year: new Date().getFullYear(),
      playerStats: [], createdAt: new Date().toISOString(),
    };
    const updated = [...leagues, newLeague];
    setLeagues(updated);
    await saveLeagues(updated);
    toast.success(`Liga "${name}" erstellt`);
  };

  const handleResetSession = () => {
    saveSwissSession(null);
    setSession(null);
    setPlayers([]);
    toast.info('Schweizer System zurückgesetzt');
  };

  // ─── Derived state ────────────────────────────────────────────────────

  const stats = session ? computeSwissStats(session.players, session.rounds) : [];

  const currentRoundData = session?.rounds.filter(r => r.roundNumber === session.currentRound) ?? [];
  const currentRoundComplete = currentRoundData.length > 0 && currentRoundData.every(r => r.isCompleted);
  const allSwissComplete = session ? session.currentRound >= session.config.rounds && currentRoundComplete : false;

  const playoffFinalMatch = session?.playoffMatches?.find(m => m.round === 1);
  const playoffChampion = playoffFinalMatch ? getPlayoffWinner(playoffFinalMatch) : null;

  // Transfer stats compatible shape
  const transferStats = stats.map(s => ({
    player: s.player,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    points: s.points,
    pointsAgainst: s.gamesPlayed * 2 - s.points,
    goalDifference: s.goalDifference,
  }));

  // ─── Render ──────────────────────────────────────────────────────────

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
                    <Label>Anzahl Runden: <span className="text-primary font-bold">{config.rounds}</span></Label>
                    <Slider
                      min={2} max={10} step={1}
                      value={[config.rounds]}
                      onValueChange={([v]) => setConfig(c => ({ ...c, rounds: v }))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>2</span><span>10</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Empfehlung: ⌈log₂(n)⌉ = {Math.ceil(Math.log2(Math.max(players.length, 2)))} Runden für {players.length} Spieler
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
            </div>
          )}
        </div>

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
      />
    </div>
  );
}
