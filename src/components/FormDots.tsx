import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatShortDate, FORM_LENGTH, FormEntry, GameResult } from '@/lib/statistics';
import { cn } from '@/lib/utils';

// Same meaning as in the rest of the app: red = win (like the highlighted winner), yellow = draw
const DOT_STYLE: Record<GameResult, string> = {
  W: 'bg-primary',
  D: 'bg-accent',
  L: 'bg-muted-foreground/40',
};

const RESULT_LABEL: Record<GameResult, string> = {
  W: 'Sieg',
  D: 'Unentschieden',
  L: 'Niederlage',
};

function describe(entry: FormEntry): string {
  return `${RESULT_LABEL[entry.result]} ${entry.goalsFor}:${entry.goalsAgainst} gegen ${entry.opponent}`;
}

interface FormDotsProps {
  /** All results, oldest first; the last ones are shown. */
  form: FormEntry[];
  count?: number;
}

/** The latest results as small dots, newest on the right. */
export function FormDots({ form, count = FORM_LENGTH }: FormDotsProps) {
  const latest = form.slice(-count);
  if (latest.length === 0) return <span className="text-muted-foreground">–</span>;

  return (
    <div className="flex items-center justify-center gap-1.5" role="list" aria-label="Letzte Ergebnisse">
      {latest.map((entry, index) => {
        const date = formatShortDate(entry.date);
        return (
          <Tooltip key={`${entry.date}-${index}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="listitem"
                aria-label={describe(entry)}
                className={cn('h-3 w-3 rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', DOT_STYLE[entry.result])}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{describe(entry)}</p>
              <p className="text-xs text-muted-foreground">
                {entry.eveningName} · {date}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Legend for the dots. */
export function FormLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(['W', 'D', 'L'] as GameResult[]).map(result => (
        <span key={result} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', DOT_STYLE[result])} />
          {RESULT_LABEL[result]}
        </span>
      ))}
    </div>
  );
}
