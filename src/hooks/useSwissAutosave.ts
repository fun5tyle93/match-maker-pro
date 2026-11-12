import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createSaveQueue, SaveQueue, SaveStatus } from '@/lib/saveQueue';
import { SwissSession } from '@/types/swiss';

// Changes that the server has not confirmed yet are kept in the browser, so a reload or a closed tab during a
// connection problem does not lose results (same idea as for the training evening).
const BACKUP_KEY = 'matchmaker:unsaved-swiss-session';
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Backup {
  savedAt: string;
  session: SwissSession;
}

function readBackup(): Backup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const backup = JSON.parse(raw) as Backup;
    const age = Date.now() - new Date(backup.savedAt).getTime();
    if (!backup?.session?.id || !Number.isFinite(age) || age > BACKUP_MAX_AGE_MS) {
      localStorage.removeItem(BACKUP_KEY);
      return null;
    }
    return backup;
  } catch {
    return null;
  }
}

function writeBackup(session: SwissSession): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), session }));
  } catch {
    // Storage can be full or blocked; the server save still works
  }
}

export function clearSwissBackup(): void {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore
  }
}

/**
 * The browser backup, if it holds changes that never reached the server: for the same tournament as on the
 * server, or when the server has no running tournament.
 */
export function findRestorableSwissBackup(onServer: SwissSession | null): SwissSession | null {
  const backup = readBackup();
  if (!backup || backup.session.isCompleted) return null;
  if (onServer && onServer.id !== backup.session.id) return null;
  return backup.session;
}

/**
 * Saves the running Swiss tournament after every change, one save at a time. Failed saves are retried and shown
 * through `status`. Only changes made after `markSaved` are saved, so merely viewing a tournament never writes.
 */
export function useSwissAutosave(
  session: SwissSession | null,
  enabled: boolean,
  save: (session: SwissSession) => Promise<void>,
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queueRef = useRef<SaveQueue<SwissSession> | null>(null);
  const baselineRef = useRef<SwissSession | null>(null);
  const closedIdRef = useRef<string | null>(null);
  const afterSaveRef = useRef<(() => void) | null>(null);
  const saveRef = useRef(save);
  // Always the latest save function, without reading or writing the ref while rendering
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    const queue = createSaveQueue<SwissSession>({
      save: value => saveRef.current(value),
      onStatus: setStatus,
      onSaved: () => {
        clearSwissBackup();
        const callback = afterSaveRef.current;
        afterSaveRef.current = null;
        callback?.();
      },
      onError: error => console.error('Saving the Swiss tournament failed:', error),
    });
    queueRef.current = queue;

    const retry = () => queue.retryNow();
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
      queue.dispose();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !session || session === baselineRef.current) return;
    if (session.id === closedIdRef.current) return;
    writeBackup(session);
    queueRef.current?.push(session);
  }, [session, enabled]);

  // Ask before closing the tab while changes are not on the server yet
  useEffect(() => {
    if (status !== 'saving' && status !== 'error') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  /** The given state is already on the server (just loaded), so do not save it again. */
  const markSaved = useCallback((saved: SwissSession | null) => {
    baselineRef.current = saved;
  }, []);

  /** Runs once after the next save was confirmed by the server. */
  const afterNextSave = useCallback((callback: () => void) => {
    afterSaveRef.current = callback;
  }, []);

  /** Stops autosaving this tournament (it is being completed or discarded) and drops waiting changes. */
  const closeSession = useCallback((id: string) => {
    closedIdRef.current = id;
    queueRef.current?.cancelPending();
  }, []);

  /** Autosaving continues (completing failed, the tournament is still being edited). */
  const reopenSession = useCallback(() => {
    closedIdRef.current = null;
  }, []);

  const retry = useCallback(() => queueRef.current?.retryNow(), []);

  return { status, retry, markSaved, afterNextSave, closeSession, reopenSession };
}

/** Shows a hint when something was restored from the browser backup. */
export function announceRestored() {
  toast.info('Nicht gespeicherte Änderungen wurden wiederhergestellt und werden jetzt gespeichert.');
}
