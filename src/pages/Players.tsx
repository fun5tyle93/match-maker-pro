import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Merge, Pencil, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { PlayerNameField } from '@/components/PlayerNameField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayerRegistry } from '@/hooks/usePlayerRegistry';
import {
  describePlayerAdminError,
  isUnused,
  matchesSearch,
  PlayerAdminAction,
  PlayerAdminData,
  PlayerAdminRow,
  UnassignedLeagueRow,
} from '@/lib/playerAdmin';
import { KnownPlayer } from '@/lib/playerPicker';
import { assignLeagueRow, deletePlayer, loadPlayerAdmin, mergePlayers, renamePlayer } from '@/lib/storage';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Administration of the list of known players (admin only): rename, merge, delete, give league rows a player. */
const Players = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const { registry, reload: reloadRegistry } = usePlayerRegistry(isAdmin);

  const [data, setData] = useState<PlayerAdminData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [renaming, setRenaming] = useState<PlayerAdminRow | null>(null);
  const [newName, setNewName] = useState('');
  const [merging, setMerging] = useState<PlayerAdminRow | null>(null);
  const [mergeInto, setMergeInto] = useState<KnownPlayer | null>(null);
  const [deleting, setDeleting] = useState<PlayerAdminRow | null>(null);
  const [assigning, setAssigning] = useState<{ row: UnassignedLeagueRow; player: KnownPlayer } | null>(null);

  // Changing the counter reads the lists again (after an action, or "Erneut laden")
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    loadPlayerAdmin()
      .then(loaded => {
        if (cancelled) return;
        setData(loaded);
        setLoadError(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load the player list administration:', err);
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, version]);

  const shown = useMemo(() => (data?.players ?? []).filter(p => matchesSearch(p, search)), [data, search]);
  const byId = useMemo(() => new Map((data?.players ?? []).map(p => [p.id, p])), [data]);

  /** Runs one action: busy while it runs, a message in German for success or failure, the lists are read again. */
  const perform = async (action: PlayerAdminAction, task: () => Promise<void>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      await task();
      toast.success(success);
      load();
      reloadRegistry();
      return true;
    } catch (err) {
      console.error(`Player administration (${action}) failed:`, err);
      toast.error(describePlayerAdminError(action, err as { code?: string; message?: string }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const frame = (content: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">{content}</main>
    </div>
  );

  if (authLoading) return frame(<p className="py-16 text-center text-muted-foreground">Lade…</p>);
  if (!isAdmin) {
    return frame(<p className="py-16 text-center text-muted-foreground">Bitte als Admin einloggen, um die Spielerliste zu pflegen.</p>);
  }
  if (loadError) {
    return frame(
      <div className="space-y-4 py-16 text-center">
        <p className="font-medium text-destructive">Die Spielerliste konnte nicht geladen werden.</p>
        <Button variant="outline" onClick={load}>Erneut laden</Button>
      </div>,
    );
  }
  if (!data) return frame(<p className="py-16 text-center text-muted-foreground">Lade Spielerliste…</p>);

  // Both players in one league: refused by the database as well; shown here before the person confirms
  const sharedLeague = merging && mergeInto
    ? byId.get(mergeInto.ref)?.leagueRows.find(l => merging.leagueRows.some(m => m.leagueId === l.leagueId))
    : undefined;

  return frame(
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserCog className="w-7 h-7 text-primary" />
        <h1 className="font-display text-2xl md:text-3xl">Spielerliste</h1>
      </div>

      {data.unassigned.length > 0 && (
        <Card data-testid="unassigned">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Liga-Zeilen ohne Spieler ({data.unassigned.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Diese Zeilen sind noch keinem Spieler zugeordnet. Doppelte Zeilen bitte zuerst in der Liga bereinigen
              (Zahlen übertragen, eine Zeile löschen) und dann zuordnen.
            </p>
            {data.unassigned.map(row => (
              <div key={row.id} className="rounded-lg border p-3 space-y-2">
                <p className="text-sm">
                  <span className="font-medium">{row.playerName}</span>
                  <span className="text-muted-foreground"> in {row.leagueName} · {row.points} Punkte
                    {row.championships > 0 ? ` · ${row.championships} Meister` : ''}</span>
                </p>
                <PlayerNameField
                  registry={registry}
                  placeholder="Spieler wählen…"
                  onPick={picked => picked.ref && setAssigning({ row, player: { ref: picked.ref, name: picked.name } })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Input
            placeholder="Name suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Suche"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">{plural(shown.length, 'Spieler', 'Spieler')}</span>
        </div>

        {shown.length === 0 && <p className="py-6 text-center text-muted-foreground">Kein Spieler gefunden.</p>}

        {shown.map(player => (
          <div key={player.id} className="rounded-lg border bg-card p-3" data-testid="player-row">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{player.displayName}</p>
                {player.aliases.length > 0 && (
                  <p className="text-xs text-muted-foreground break-words">auch: {player.aliases.join(', ')}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {plural(player.evenings, 'Abend', 'Abende')} · {plural(player.leagueRows.length, 'Liga-Zeile', 'Liga-Zeilen')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setRenaming(player); setNewName(player.displayName); }}>
                  <Pencil className="w-4 h-4 mr-1" />Umbenennen
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setMerging(player); setMergeInto(null); }}>
                  <Merge className="w-4 h-4 mr-1" />Zusammenführen…
                </Button>
                {isUnused(player) && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleting(player)} aria-label={`${player.displayName} löschen`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rename */}
      <Dialog open={!!renaming} onOpenChange={open => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spieler umbenennen</DialogTitle>
            <DialogDescription>
              Der bisherige Name bleibt als anderer Name erhalten. Die Liga-Zeilen zeigen den neuen Namen; Namen auf
              Abenden und in Partien bleiben, wie sie getippt wurden.
            </DialogDescription>
          </DialogHeader>
          <Input value={newName} onChange={e => setNewName(e.target.value)} aria-label="Neuer Name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Abbrechen</Button>
            <Button
              disabled={busy || !newName.trim() || newName.trim() === renaming?.displayName}
              onClick={async () => {
                if (renaming && await perform('rename', () => renamePlayer(renaming.id, newName), `„${renaming.displayName}“ heißt jetzt „${newName.trim().replace(/\s+/g, ' ')}“`)) setRenaming(null);
              }}
            >
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge */}
      <Dialog open={!!merging} onOpenChange={open => { if (!open) { setMerging(null); setMergeInto(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spieler zusammenführen</DialogTitle>
            <DialogDescription>„{merging?.displayName}“ ist in Wirklichkeit:</DialogDescription>
          </DialogHeader>
          {!mergeInto ? (
            <PlayerNameField
              registry={registry}
              placeholder="Spieler suchen…"
              isTaken={known => known.ref === merging?.id}
              onPick={picked => picked.ref && setMergeInto({ ref: picked.ref, name: picked.name })}
              autoFocus
            />
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Alle {plural(merging?.evenings ?? 0, 'Abend', 'Abende')} und {plural(merging?.leagueRows.length ?? 0, 'Liga-Zeile', 'Liga-Zeilen')} von
                „{merging?.displayName}“ gehen auf <span className="font-medium">„{mergeInto.name}“</span> über.
                „{merging?.displayName}“ wird als anderer Name von „{mergeInto.name}“ gespeichert.
                Das lässt sich nicht automatisch rückgängig machen.
              </p>
              {sharedLeague && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                  Beide stehen in der Liga „{sharedLeague.leagueName}“. Bitte dort zuerst eine der Zeilen bereinigen
                  (Zahlen übertragen, eine Zeile löschen).
                </p>
              )}
              <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setMergeInto(null)}>Anderen Spieler wählen</button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMerging(null); setMergeInto(null); }}>Abbrechen</Button>
            <Button
              variant="destructive"
              disabled={busy || !mergeInto || !!sharedLeague}
              onClick={async () => {
                if (merging && mergeInto && await perform('merge', () => mergePlayers(merging.id, mergeInto.ref), `„${merging.displayName}“ ist jetzt „${mergeInto.name}“`)) {
                  setMerging(null);
                  setMergeInto(null);
                }
              }}
            >
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Zusammenführen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (only for players that are used nowhere) */}
      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>„{deleting?.displayName}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription>Der Spieler kommt nirgends vor und wird aus der Spielerliste entfernt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && void perform('delete', () => deletePlayer(deleting.id), `„${deleting.displayName}“ gelöscht`)}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Give a league row its player */}
      <AlertDialog open={!!assigning} onOpenChange={open => !open && setAssigning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zeile zuordnen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{assigning?.row.playerName}“ in „{assigning?.row.leagueName}“ wird dem Spieler „{assigning?.player.name}“ zugeordnet.
              Die Zeile zeigt danach seinen Namen. Bitte danach in dieser Liga die Prüfung „berechnet = gespeichert“ ansehen und
              bei Bedarf „Als neuen Stand übernehmen“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => assigning && void perform('assign', () => assignLeagueRow(assigning.row.id, assigning.player.ref, assigning.player.name), 'Zeile zugeordnet')}
            >
              Zuordnen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
  );
};

export default Players;
