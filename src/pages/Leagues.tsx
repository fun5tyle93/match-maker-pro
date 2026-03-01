import { useState, useEffect } from 'react';
import { Plus, Trophy, Trash2, Calendar, Download, FileSpreadsheet, FileText, Pencil, Save, X, UserPlus, Medal, Award, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EternalLeagueTable } from '@/components/EternalLeagueTable';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { League, PlayerStats, Player } from '@/types';
import { loadLeagues, saveLeagues } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { exportLeagueToXLSX, exportLeagueToPDF } from '@/lib/exportUtils';
import { cn } from '@/lib/utils';

const Leagues = () => {
  const { isAdmin } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [showNewLeague, setShowNewLeague] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerStats | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [loading, setLoading] = useState(true);

  // Edit form state
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editWins, setEditWins] = useState(0);
  const [editDraws, setEditDraws] = useState(0);
  const [editLosses, setEditLosses] = useState(0);
  const [editGoalsFor, setEditGoalsFor] = useState(0);
  const [editGoalsAgainst, setEditGoalsAgainst] = useState(0);
  const [editChampionships, setEditChampionships] = useState(0);
  const [editViceChampionships, setEditViceChampionships] = useState(0);
  const [editPointsAgainst, setEditPointsAgainst] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const loaded = await loadLeagues();
        setLeagues(loaded);
        if (loaded.length > 0) {
          setSelectedLeague(loaded[0]);
        }
      } catch (err) {
        console.error('Failed to load leagues:', err);
        toast.error('Fehler beim Laden der Ligen');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleCreateLeague = async () => {
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
    await saveLeagues(updatedLeagues);
    setSelectedLeague(newLeague);
    setNewLeagueName('');
    setShowNewLeague(false);
    toast.success(`Liga "${newLeague.name}" erstellt`);
  };

  const handleDeleteLeague = async (leagueId: string) => {
    const updatedLeagues = leagues.filter(l => l.id !== leagueId);
    setLeagues(updatedLeagues);
    await saveLeagues(updatedLeagues);
    
    if (selectedLeague?.id === leagueId) {
      setSelectedLeague(updatedLeagues[0] || null);
    }
    
    toast.success('Liga gelöscht');
  };

  const handleEditPlayer = (stat: PlayerStats) => {
    setEditingPlayer(stat);
    setEditPlayerName(stat.player.name);
    // For eternal league: editWins stores the total points value
    setEditWins(selectedLeague?.isEternal ? stat.points : stat.wins);
    setEditPointsAgainst(stat.pointsAgainst);
    setEditDraws(stat.draws);
    setEditLosses(stat.losses);
    setEditGoalsFor(stat.goalsFor);
    setEditGoalsAgainst(stat.goalsAgainst);
    setEditChampionships(stat.championships || 0);
    setEditViceChampionships(stat.viceChampionships || 0);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedLeague || !editingPlayer) return;

    const updatedStats = selectedLeague.playerStats.map(s => {
      if (s.player.id === editingPlayer.player.id) {
        if (selectedLeague.isEternal) {
          return {
            ...s,
            player: { ...s.player, name: editPlayerName.trim() || s.player.name },
            points: editWins,
            pointsAgainst: editPointsAgainst,
            championships: editChampionships,
          };
        }
        const points = editWins * 2 + editDraws;
        const pointsAgainst = editLosses * 2 + editDraws;
        return {
          ...s,
          player: {
            ...s.player,
            name: editPlayerName.trim() || s.player.name,
          },
          wins: editWins,
          draws: editDraws,
          losses: editLosses,
          goalsFor: editGoalsFor,
          goalsAgainst: editGoalsAgainst,
          points,
          pointsAgainst,
          goalDifference: editGoalsFor - editGoalsAgainst,
          championships: editChampionships,
          viceChampionships: editViceChampionships,
        };
      }
      return s;
    });

    updatedStats.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    const updatedLeague = { ...selectedLeague, playerStats: updatedStats };
    const updatedLeagues = leagues.map(l => l.id === selectedLeague.id ? updatedLeague : l);
    
    setLeagues(updatedLeagues);
    await saveLeagues(updatedLeagues);
    setSelectedLeague(updatedLeague);
    setShowEditDialog(false);
    toast.success('Spieler aktualisiert');
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!selectedLeague) return;

    const updatedStats = selectedLeague.playerStats.filter(s => s.player.id !== playerId);
    const updatedLeague = { ...selectedLeague, playerStats: updatedStats };
    const updatedLeagues = leagues.map(l => l.id === selectedLeague.id ? updatedLeague : l);
    
    setLeagues(updatedLeagues);
    await saveLeagues(updatedLeagues);
    setSelectedLeague(updatedLeague);
    toast.success('Spieler entfernt');
  };

  const handleAddPlayer = async () => {
    if (!selectedLeague || !newPlayerName.trim()) return;

    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: newPlayerName.trim(),
    };

    const newStat: PlayerStats = {
      player: newPlayer,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      pointsAgainst: 0,
      goalDifference: 0,
      championships: 0,
      viceChampionships: 0,
    };

    const updatedStats = [...selectedLeague.playerStats, newStat];
    const updatedLeague = { ...selectedLeague, playerStats: updatedStats };
    const updatedLeagues = leagues.map(l => l.id === selectedLeague.id ? updatedLeague : l);
    
    setLeagues(updatedLeagues);
    await saveLeagues(updatedLeagues);
    setSelectedLeague(updatedLeague);
    setNewPlayerName('');
    setShowAddPlayer(false);
    toast.success(`Spieler "${newPlayer.name}" hinzugefügt`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-8">
          <p className="text-muted-foreground text-center py-16">Lade Ligen...</p>
        </main>
      </div>
    );
  }

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
                        ? league.isEternal ? "border-accent bg-accent/10" : "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <p className="font-semibold flex items-center gap-1">
                      {league.isEternal && <Star className="w-3.5 h-3.5 text-accent shrink-0" />}
                      {league.name}
                    </p>
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

                {isAdmin && (showNewLeague ? (
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
                ))}
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
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddPlayer(true)}
                          >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Spieler
                          </Button>
                        )}
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
                        {isAdmin && (
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
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Standings Table — eternal or normal */}
                {selectedLeague.isEternal ? (
                  <EternalLeagueTable
                    stats={selectedLeague.playerStats}
                    isAdmin={isAdmin}
                    onEdit={handleEditPlayer}
                    onDelete={handleDeletePlayer}
                  />
                ) : (
                <Card className="animate-fade-in">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-accent" />
                      Gesamttabelle {selectedLeague.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedLeague.playerStats.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        Noch keine Spieler vorhanden
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                              <th className="text-left py-3 px-2">#</th>
                              <th className="text-left py-3 px-2">Spieler</th>
                              <th className="text-center py-3 px-2">Spiele</th>
                              <th className="text-center py-3 px-2">Pkt</th>
                              <th className="text-center py-3 px-2">Tore</th>
                              <th className="text-center py-3 px-2">Diff</th>
                              <th className="text-center py-3 px-2" title="Meisterschaften">
                                <Medal className="w-4 h-4 inline text-gold" />
                              </th>
                              <th className="text-center py-3 px-2" title="Vizemeisterschaften">
                                <Award className="w-4 h-4 inline text-silver" />
                              </th>
                              <th className="text-center py-3 px-2" title="Durchschnittliche Punkte pro Spiel (0-2)">∅ Pkt/Spiel</th>
                              <th className="text-right py-3 px-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedLeague.playerStats.map((stat, index) => (
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
                                <td className="py-3 px-2 text-center font-mono">
                                  {Math.floor((stat.points + stat.pointsAgainst) / 2)}
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
                                <td className="py-3 px-2 text-center font-mono font-bold text-gold">
                                  {stat.championships || 0}
                                </td>
                                <td className="py-3 px-2 text-center font-mono font-bold text-silver">
                                  {stat.viceChampionships || 0}
                                </td>
                                <td className="py-3 px-2 text-center font-mono">
                                  {(() => {
                                    const totalPoints = stat.points + stat.pointsAgainst;
                                    if (totalPoints === 0) return '-';
                                    const avgPoints = (stat.points / totalPoints) * 2;
                                    return avgPoints.toFixed(2);
                                  })()}
                                </td>
                                <td className="py-3 px-2 text-right">
                                  {isAdmin && (
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditPlayer(stat)}
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </Button>
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
                                              "{stat.player.name}" wird aus der Liga entfernt.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => handleDeletePlayer(stat.player.id)}
                                              className="bg-destructive text-destructive-foreground"
                                            >
                                              Entfernen
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
                )}
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

      {/* Edit Player Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spieler bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="editPlayerName">Spielername</Label>
            <Input
              id="editPlayerName"
              value={editPlayerName}
              onChange={(e) => setEditPlayerName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid gap-4 py-4">
            {selectedLeague?.isEternal ? (
              /* Eternal league: points+, points-, championships */
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="eternalPoints" className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-accent" /> Pkt+
                  </Label>
                  <Input
                    id="eternalPoints"
                    type="number"
                    min="0"
                    value={editWins}
                    onChange={(e) => setEditWins(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="eternalPointsAgainst">Pkt−</Label>
                  <Input
                    id="eternalPointsAgainst"
                    type="number"
                    min="0"
                    value={editPointsAgainst}
                    onChange={(e) => setEditPointsAgainst(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="eternalChamp" className="flex items-center gap-1">
                    <Medal className="w-4 h-4 text-gold" /> M
                  </Label>
                  <Input
                    id="eternalChamp"
                    type="number"
                    min="0"
                    value={editChampionships}
                    onChange={(e) => setEditChampionships(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            ) : (
              /* Normal league: full edit */
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="wins">Siege</Label>
                    <Input
                      id="wins"
                      type="number"
                      min="0"
                      value={editWins}
                      onChange={(e) => setEditWins(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="draws">Unentschieden</Label>
                    <Input
                      id="draws"
                      type="number"
                      min="0"
                      value={editDraws}
                      onChange={(e) => setEditDraws(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="losses">Niederlagen</Label>
                    <Input
                      id="losses"
                      type="number"
                      min="0"
                      value={editLosses}
                      onChange={(e) => setEditLosses(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="goalsFor">Tore geschossen</Label>
                    <Input
                      id="goalsFor"
                      type="number"
                      min="0"
                      value={editGoalsFor}
                      onChange={(e) => setEditGoalsFor(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="goalsAgainst">Tore erhalten</Label>
                    <Input
                      id="goalsAgainst"
                      type="number"
                      min="0"
                      value={editGoalsAgainst}
                      onChange={(e) => setEditGoalsAgainst(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="championships" className="flex items-center gap-1">
                      <Medal className="w-4 h-4 text-gold" /> Meisterschaften
                    </Label>
                    <Input
                      id="championships"
                      type="number"
                      min="0"
                      value={editChampionships}
                      onChange={(e) => setEditChampionships(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="viceChampionships" className="flex items-center gap-1">
                      <Award className="w-4 h-4 text-silver" /> Vizemeisterschaften
                    </Label>
                    <Input
                      id="viceChampionships"
                      type="number"
                      min="0"
                      value={editViceChampionships}
                      onChange={(e) => setEditViceChampionships(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveEdit}>
              <Save className="w-4 h-4 mr-2" />
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Player Dialog */}
      <Dialog open={showAddPlayer} onOpenChange={setShowAddPlayer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spieler hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="playerName">Spielername</Label>
            <Input
              id="playerName"
              placeholder="Name eingeben..."
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPlayer(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleAddPlayer} disabled={!newPlayerName.trim()}>
              <UserPlus className="w-4 h-4 mr-2" />
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leagues;
