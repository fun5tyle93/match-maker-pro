import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cleanName, KnownPlayer, resolvePlayer, suggestPlayers } from '@/lib/playerPicker';
import { PlayerRegistry } from '@/lib/playerRegistry';
import { cn } from '@/lib/utils';

export interface PickedPlayer {
  name: string;
  /** Fixed identity; missing when there is no player list (free text) */
  ref?: string;
}

interface PlayerNameFieldProps {
  /** Known players. Without it (null) the field takes any text, as before the player list existed. */
  registry: PlayerRegistry | null;
  /** Adds a new person to the player list; resolves to the stored player. Without it only known players can be chosen. */
  onCreate?: (name: string) => Promise<KnownPlayer>;
  /** A player was chosen (or typed, without a list) */
  onPick: (player: PickedPlayer) => void;
  /** Known players that are already taken (for example on the evening); they are shown but cannot be picked */
  isTaken?: (player: KnownPlayer) => boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Entry field for a player: suggestions from the list of known players while typing, a known name is added
 * directly, and a name that is not in the list asks before it creates a new player (with hints on similar names).
 */
export function PlayerNameField({ registry, onCreate, onPick, isTaken, placeholder, autoFocus }: PlayerNameFieldProps) {
  const [text, setText] = useState('');
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => (registry ? suggestPlayers(registry, text) : []), [registry, text]);
  const pending = useMemo(
    () => (registry && pendingName !== null ? resolvePlayer(registry, pendingName) : null),
    [registry, pendingName],
  );

  const reset = () => {
    setText('');
    setPendingName(null);
  };

  const pick = (player: KnownPlayer) => {
    if (isTaken?.(player)) {
      toast.error(`„${player.name}“ ist schon dabei`);
      return;
    }
    onPick({ name: player.name, ref: player.ref });
    reset();
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const name = cleanName(text);
    if (!name) return;
    if (!registry) {
      onPick({ name });
      reset();
      return;
    }
    const resolved = resolvePlayer(registry, name);
    if (resolved.kind === 'known') pick(resolved.player);
    else setPendingName(resolved.name);
  };

  const create = async () => {
    if (!onCreate || pendingName === null) return;
    setSaving(true);
    try {
      pick(await onCreate(pendingName));
    } catch (err) {
      console.error('Failed to create the player:', err);
      toast.error('Spieler konnte nicht angelegt werden. Bitte Verbindung prüfen und erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          type="text"
          placeholder={placeholder ?? (registry ? 'Spieler suchen oder neu eingeben...' : 'Spielername eingeben...')}
          value={text}
          onChange={e => {
            setText(e.target.value);
            setPendingName(null);
          }}
          autoFocus={autoFocus}
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!cleanName(text) || saving} aria-label="Spieler hinzufügen">
          <Plus className="w-4 h-4" />
        </Button>
      </form>

      {pending?.kind === 'new' ? (
        <div className="rounded-lg border border-accent/60 bg-accent/10 p-3 space-y-2" role="group" aria-label="Neuer Spieler">
          <p className="text-sm">
            <span className="font-medium">„{pending.name}“</span> ist noch nicht in der Spielerliste.
          </p>
          {pending.similar.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Ist es einer von diesen?</p>
              {pending.similar.map(candidate => (
                <button
                  key={candidate.ref}
                  type="button"
                  onClick={() => pick({ ref: candidate.ref, name: candidate.name })}
                  className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/60"
                >
                  <span className="font-medium">Ja, das ist {candidate.name}</span>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {onCreate && (
              <Button type="button" size="sm" onClick={create} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Neuen Spieler anlegen
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setPendingName(null)} disabled={saving}>
              <X className="w-4 h-4 mr-1" />
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2" role="listbox" aria-label="Vorschläge">
            {suggestions.map(player => {
              const taken = isTaken?.(player) ?? false;
              return (
                <button
                  key={player.ref}
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={taken}
                  onClick={() => pick(player)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm transition-all',
                    taken ? 'border-border text-muted-foreground opacity-60' : 'border-border hover:border-primary/60 hover:bg-primary/5',
                  )}
                >
                  {player.name}
                  {taken && <span className="ml-1 text-xs">(dabei)</span>}
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
