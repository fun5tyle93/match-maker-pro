import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
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
import { COLUMN_LABEL, checkLeague, LeagueCheck, openingsFor } from '@/lib/leagueCheck';
import { loadHistory, loadOpeningBalances, saveOpeningBalances } from '@/lib/storage';
import { League, TrainingSession } from '@/types';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | { kind: 'done'; check: LeagueCheck; sessions: TrainingSession[] };

/**
 * "Prüfung: berechnet = gespeichert" for one league (admin). Works out opening balance + the transferred evenings and
 * compares it with the stored table. It only tells; a deliberate manual change can be taken over as the new state.
 */
export function LeagueCheckCard({ league }: { league: League }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);

  // The league changed (edited, another league chosen): an earlier result no longer says anything
  const [checkedLeague, setCheckedLeague] = useState(league);
  if (checkedLeague !== league) {
    setCheckedLeague(league);
    setState({ kind: 'idle' });
  }

  const run = async () => {
    setState({ kind: 'loading' });
    try {
      const [history, openings] = await Promise.all([loadHistory(), loadOpeningBalances(league.id)]);
      if (openings === null) {
        setState({ kind: 'unavailable' });
        return;
      }
      const sessions = history.filter(s => (s.transferredToLeagues ?? []).includes(league.id));
      setState({ kind: 'done', check: checkLeague(league, sessions, openings), sessions });
    } catch (err) {
      console.error('League check failed:', err);
      setState({ kind: 'error' });
    }
  };

  const takeOver = async () => {
    if (state.kind !== 'done') return;
    setSaving(true);
    try {
      await saveOpeningBalances(league.id, openingsFor(league, state.sessions).map(o => ({ ref: o.ref, opening: o.opening })));
      toast.success('Als neuer Stand übernommen');
      await run();
    } catch (err) {
      console.error('Taking over the opening balances failed:', err);
      toast.error('Der neue Stand konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  const check = state.kind === 'done' ? state.check : null;

  return (
    <Card className="animate-fade-in" data-testid="league-check">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Prüfung: berechnet = gespeichert
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state.kind === 'idle' && (
          <>
            <p className="text-muted-foreground">
              Rechnet die Tabelle aus Startbestand und den übertragenen Abenden nach und zeigt, ob sie zur gespeicherten Tabelle passt.
              Es wird nichts verändert.
            </p>
            <Button size="sm" variant="outline" onClick={run}>Prüfen</Button>
          </>
        )}
        {state.kind === 'loading' && (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Prüfe…</p>
        )}
        {state.kind === 'unavailable' && (
          <p className="text-muted-foreground">Die Prüfung ist in dieser Datenbank noch nicht eingerichtet.</p>
        )}
        {state.kind === 'error' && (
          <>
            <p className="text-destructive">Die Prüfung konnte nicht durchgeführt werden. Bitte Verbindung prüfen.</p>
            <Button size="sm" variant="outline" onClick={run}>Erneut versuchen</Button>
          </>
        )}

        {check && (
          <>
            {check.ok ? (
              <p className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Berechnet = gespeichert ({check.checkedRows} {check.checkedRows === 1 ? 'Zeile' : 'Zeilen'} geprüft)
              </p>
            ) : (
              <p className="flex items-center gap-2 font-medium text-destructive">
                <TriangleAlert className="w-4 h-4" />
                Abweichung gefunden ({check.differences.length + check.missingRows.length})
              </p>
            )}

            {check.differences.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1 pr-2">Spieler</th>
                      <th className="py-1 pr-2">Spalte</th>
                      <th className="py-1 pr-2 text-right">berechnet</th>
                      <th className="py-1 text-right">gespeichert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {check.differences.map(d => (
                      <tr key={`${d.name}-${d.column}`} className="border-b border-border/50">
                        <td className="py-1 pr-2">{d.name}</td>
                        <td className="py-1 pr-2">{COLUMN_LABEL[d.column]}</td>
                        <td className="py-1 pr-2 text-right font-mono">{d.computed}</td>
                        <td className="py-1 text-right font-mono">{d.stored}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {check.missingRows.length > 0 && (
              <p className="text-xs">
                Ohne Zeile in der Liga, obwohl Abende für sie gebucht haben: {check.missingRows.map(m => m.name).join(', ')}
              </p>
            )}
            {check.notChecked.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Nicht geprüft (keine feste Spieler-Identität): {check.notChecked.join(', ')}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={run} disabled={saving}>Erneut prüfen</Button>
              {!check.ok && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={saving}>Als neuen Stand übernehmen</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Als neuen Stand übernehmen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Die Abweichungen gelten dann als gewollt (zum Beispiel eine bewusste Handkorrektur). Die gespeicherte Tabelle
                        wird dabei nicht verändert, nur der Startbestand für diese Prüfung wird neu gesetzt.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={takeOver}>Übernehmen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
