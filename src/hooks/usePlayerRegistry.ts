import { useCallback, useEffect, useState } from 'react';
import { createPlayer, loadPlayerRegistry } from '@/lib/storage';
import { cleanName } from '@/lib/playerPicker';
import { playerKey, PlayerRegistry } from '@/lib/playerRegistry';

/**
 * The list of known players for the entry field. `registry` is null while it loads and when it cannot be
 * loaded (tables missing, connection problem); the entry field then works with free text, as before.
 */
export function usePlayerRegistry(enabled: boolean) {
  const [registry, setRegistry] = useState<PlayerRegistry | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadPlayerRegistry()
      .then(loaded => {
        // An empty list means the tables do not exist (yet): behave as without a list
        if (!cancelled) setRegistry(loaded.names.size > 0 ? loaded : null);
      })
      .catch(err => console.error('Failed to load the player list:', err));
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  /** Adds a new person to the list; resolves to the stored player. Throws when it cannot be saved. */
  const addPlayer = useCallback(async (name: string): Promise<{ ref: string; name: string }> => {
    const created = await createPlayer(cleanName(name));
    setRegistry(current => {
      if (!current) return current;
      const names = new Map(current.names).set(created.id, created.displayName);
      const refByName = new Map(current.refByName).set(playerKey(created.displayName), created.id);
      return { names, refByName };
    });
    return { ref: created.id, name: created.displayName };
  }, []);

  /** Reads the list again, for example after a player was renamed or merged. */
  const reload = useCallback(() => setVersion(v => v + 1), []);

  return { registry, addPlayer, reload };
}
