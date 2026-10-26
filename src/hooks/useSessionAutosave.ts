import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveCurrentSession } from '@/lib/storage';
import { createSaveQueue, SaveQueue, SaveStatus } from '@/lib/saveQueue';
import { TrainingSession } from '@/types';

// Unsaved changes are kept in the browser until the server confirmed them,
// so a reload or a closed tab during a connection problem does not lose results.
const BACKUP_KEY = 'matchmaker:unsaved-training-session';
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Backup {
  savedAt: string;
  session: TrainingSession;
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

function writeBackup(session: TrainingSession): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), session }));
  } catch {
    // Storage can be full or blocked; the server save still works
  }
}

export function clearBackup(): void {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns the browser backup if it holds changes that never reached the server for
 * the running evening (same evening as on the server, or no evening on the server).
 */
export function findRestorableBackup(onServer: TrainingSession | null): TrainingSession | null {
  const backup = readBackup();
  if (!backup || backup.session.isCompleted) return null;
  if (onServer && onServer.id !== backup.session.id) return null;
  return backup.session;
}

/**
 * Saves the running training evening after every change, one save at a time.
 * Failed saves are retried automatically and shown through `status`.
 * Only changes made after `markSaved` are saved, so merely viewing an evening
 * (for example as a spectator) never writes anything.
 */
export function useSessionAutosave(session: TrainingSession | null, enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queueRef = useRef<SaveQueue<TrainingSession> | null>(null);
  const baselineRef = useRef<TrainingSession | null>(null);
  const announceRef = useRef<string | null>(null);

  useEffect(() => {
    const queue = createSaveQueue<TrainingSession>({
      save: value => saveCurrentSession(value),
      onStatus: setStatus,
      onSaved: () => {
        clearBackup();
        if (announceRef.current) {
          toast.success(announceRef.current);
          announceRef.current = null;
        }
      },
      onError: error => console.error('Saving the training evening failed:', error),
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
  const markSaved = useCallback((saved: TrainingSession | null) => {
    baselineRef.current = saved;
  }, []);

  /** Shows this message once the next save was confirmed by the server. */
  const announceOnSave = useCallback((message: string) => {
    announceRef.current = message;
  }, []);

  /** Drops changes that wait for a save (used before an explicit save such as completing the evening). */
  const cancelPending = useCallback(() => {
    queueRef.current?.cancelPending();
  }, []);

  const retry = useCallback(() => queueRef.current?.retryNow(), []);

  return { status, retry, markSaved, announceOnSave, cancelPending };
}
