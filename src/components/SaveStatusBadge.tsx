import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SaveStatus } from '@/lib/saveQueue';

interface SaveStatusBadgeProps {
  status: SaveStatus;
  onRetry: () => void;
}

export function SaveStatusBadge({ status, onRetry }: SaveStatusBadgeProps) {
  if (status === 'idle') return null;

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <span className="flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nicht gespeichert – Verbindung prüfen. Die Eingaben bleiben erhalten und werden automatisch erneut gesendet.
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Jetzt erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <p role="status" className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
      {status === 'saving' ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          Speichert…
        </>
      ) : (
        <>
          <Check className="h-3 w-3" />
          Gespeichert
        </>
      )}
    </p>
  );
}
