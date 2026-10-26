import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Calendar, Swords, Target, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { FormDots, FormLegend } from '@/components/FormDots';
import { HeadToHeadCard } from '@/components/HeadToHeadCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadHistory } from '@/lib/storage';
import { pluralize } from '@/lib/plural';
import {
  availableYears,
  buildOverview,
  buildRecords,
  MIN_GAMES_FOR_RANKING,
  SortDirection,
  SortKey,
  sortRecords,
} from '@/lib/statistics';
import { TrainingSession } from '@/types';
import { cn } from '@/lib/utils';

const ALL_YEARS = 'all';

const decimal = (value: number, digits: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const getRankColor = (rank: number) =>
  rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-muted-foreground';

const getRankBg = (rank: number) =>
  rank === 1 ? 'bg-gold/10 border-gold/30' : rank === 2 ? 'bg-silver/10 border-silver/30' : rank === 3 ? 'bg-bronze/10 border-bronze/30' : '';

interface Column {
  key: SortKey;
  label: string;
  title: string;
  /** Sorts ascending first (names); everything else starts with the highest value. */
  ascendingFirst?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Spieler', title: 'Nach Name sortieren', ascendingFirst: true },
  { key: 'evenings', label: 'Abende', title: 'Anzahl der Trainingsabende, an denen der Spieler dabei war' },
  { key: 'games', label: 'Spiele', title: 'Gespielte Spiele' },
  { key: 'winRate', label: 'Siegquote', title: `Anteil gewonnener Spiele (ab ${MIN_GAMES_FOR_RANKING} Spielen in der Rangfolge)` },
  { key: 'avgPoints', label: '∅ Pkt', title: `Durchschnittliche Punkte pro Spiel, 0 bis 2 (ab ${MIN_GAMES_FOR_RANKING} Spielen in der Rangfolge)` },
  { key: 'goalDifference', label: 'Diff', title: 'Tordifferenz' },
  { key: 'titles', label: 'Siege', title: 'Gewonnene Abende (Sieger der Playoffs, sonst Erster der Tabelle)' },
];

const column = (key: SortKey): Column => COLUMNS.find(c => c.key === key)!;

const Statistics = () => {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [yearValue, setYearValue] = useState(ALL_YEARS);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'winRate', direction: 'desc' });

  // Changing the counter loads the history again ("Erneut laden")
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then(data => {
        if (cancelled) return;
        setSessions(data);
        setLoadError(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load statistics:', err);
        setLoadError(true);
        toast.error('Fehler beim Laden der Statistiken');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const retry = () => {
    setLoading(true);
    setReloadCount(count => count + 1);
  };

  const years = useMemo(() => availableYears(sessions), [sessions]);
  // A year that no longer exists (for example after a reload of the data) falls back to all years
  const year = yearValue !== ALL_YEARS && years.includes(Number(yearValue)) ? Number(yearValue) : undefined;

  const records = useMemo(() => buildRecords(sessions, year), [sessions, year]);
  const overview = useMemo(() => buildOverview(sessions, year), [sessions, year]);
  const sorted = useMemo(() => sortRecords(records, sort.key, sort.direction), [records, sort]);

  const toggleSort = (column: Column) =>
    setSort(current =>
      current.key === column.key
        ? { key: column.key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key: column.key, direction: column.ascendingFirst ? 'asc' : 'desc' },
    );

  // Medal colors only mean something when the table is ordered by a value, best first
  const showRankColors = sort.key !== 'name' && sort.direction === 'desc';

  const frame = (content: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 md:py-8">{content}</main>
    </div>
  );

  if (loading) {
    return frame(<p className="py-16 text-center text-muted-foreground">Lade Statistiken...</p>);
  }

  if (loadError) {
    return frame(
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="font-medium text-destructive">Die Statistiken konnten nicht geladen werden.</p>
        <p className="text-sm text-muted-foreground">Bitte Verbindung prüfen und erneut laden.</p>
        <Button onClick={retry}>Erneut laden</Button>
      </div>,
    );
  }

  const tiles = [
    { icon: Calendar, label: 'Abende', value: String(overview.evenings) },
    { icon: Swords, label: 'Spiele', value: String(overview.games) },
    { icon: Users, label: 'Spieler', value: String(overview.players) },
    { icon: Target, label: 'Tore', value: String(overview.goals), hint: overview.games > 0 ? `∅ ${decimal(overview.goalsPerGame, 1)} pro Spiel` : undefined },
  ];

  return frame(
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl md:text-3xl">
          <BarChart3 className="h-7 w-7 text-primary" />
          Statistiken
        </h1>

        {years.length > 0 && (
          <Select value={year === undefined ? ALL_YEARS : String(year)} onValueChange={setYearValue}>
            <SelectTrigger className="w-40" aria-label="Zeitraum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_YEARS}>Alle Jahre</SelectItem>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {overview.games === 0 ? (
        <Card className="animate-fade-in">
          <CardContent className="py-16 text-center">
            <BarChart3 className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
            <p className="text-muted-foreground">Noch keine abgeschlossenen Trainings mit gespielten Spielen</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="overview">
            {tiles.map(tile => (
              <Card key={tile.label} className="animate-fade-in">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <tile.icon className="h-4 w-4 text-primary" />
                    {tile.label}
                  </div>
                  <p className="mt-1 font-display text-3xl">{tile.value}</p>
                  {tile.hint && <p className="text-xs text-muted-foreground">{tile.hint}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent" />
                Spieler im Vergleich
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] whitespace-nowrap" data-testid="player-table">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-3 text-left">#</th>
                      <SortHeader column={column('name')} sort={sort} onSort={toggleSort} align="left" />
                      <SortHeader column={column('evenings')} sort={sort} onSort={toggleSort} />
                      <SortHeader column={column('games')} sort={sort} onSort={toggleSort} />
                      <th className="px-2 py-3 text-center" title="Siege – Unentschieden – Niederlagen">S–U–N</th>
                      <SortHeader column={column('winRate')} sort={sort} onSort={toggleSort} />
                      <SortHeader column={column('avgPoints')} sort={sort} onSort={toggleSort} />
                      <th className="px-2 py-3 text-center">Tore</th>
                      <SortHeader column={column('goalDifference')} sort={sort} onSort={toggleSort} />
                      <SortHeader column={column('titles')} sort={sort} onSort={toggleSort} />
                      <th className="px-2 py-3 text-center" title="Ergebnisse der letzten Spiele, neuestes rechts">Form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((record, index) => {
                      const rank = index + 1;
                      const counts = record.games >= MIN_GAMES_FOR_RANKING;
                      const rateClass = counts ? '' : 'text-muted-foreground';
                      return (
                        <tr
                          key={record.key}
                          className={cn(
                            'animate-slide-up border-b border-border/50 transition-colors hover:bg-secondary/50',
                            showRankColors && counts ? getRankBg(rank) : '',
                          )}
                          style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                        >
                          <td className={cn('px-2 py-3 font-display text-lg', showRankColors && counts ? getRankColor(rank) : 'text-muted-foreground')}>
                            {rank}
                          </td>
                          <td className="px-2 py-3 font-semibold">{record.name}</td>
                          <td className="px-2 py-3 text-center font-mono">{record.evenings}</td>
                          <td className="px-2 py-3 text-center font-mono">{record.games}</td>
                          <td className="px-2 py-3 text-center font-mono">
                            <span className="font-bold text-primary">{record.wins}</span>
                            <span className="text-muted-foreground">–</span>
                            <span>{record.draws}</span>
                            <span className="text-muted-foreground">–</span>
                            <span className="text-muted-foreground">{record.losses}</span>
                          </td>
                          <td className={cn('px-2 py-3', rateClass)}>
                            {record.games > 0 ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                                  <div className="h-full bg-primary" style={{ width: `${record.winRate * 100}%` }} />
                                </div>
                                <span className="w-10 text-right font-mono">{Math.round(record.winRate * 100)} %</span>
                              </div>
                            ) : (
                              <div className="text-center">–</div>
                            )}
                          </td>
                          <td className={cn('px-2 py-3 text-center font-mono', rateClass)}>
                            {record.games > 0 ? decimal(record.avgPoints, 2) : '–'}
                          </td>
                          <td className="px-2 py-3 text-center font-mono">
                            <span>{record.goalsFor}</span>
                            <span className="text-muted-foreground">:</span>
                            <span className="text-muted-foreground">{record.goalsAgainst}</span>
                          </td>
                          <td
                            className={cn(
                              'px-2 py-3 text-center font-mono font-bold',
                              record.goalDifference > 0 && 'text-primary',
                              record.goalDifference < 0 && 'text-destructive',
                              record.goalDifference === 0 && 'text-muted-foreground',
                            )}
                          >
                            {record.goalDifference > 0 ? `+${record.goalDifference}` : record.goalDifference}
                          </td>
                          <td className="px-2 py-3 text-center font-mono">
                            {record.titles > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-gold">
                                <Trophy className="h-3.5 w-3.5" />
                                {record.titles}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <FormDots form={record.form} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-2 border-t border-border/50 pt-4">
                <FormLegend />
                <p className="text-xs text-muted-foreground">
                  Siegquote und ∅ Pkt zählen erst ab {pluralize(MIN_GAMES_FOR_RANKING, 'Spiel', 'Spielen')} für die Rangfolge; bis dahin sind sie grau
                  und stehen am Ende. Gewertet werden alle abgeschlossenen Trainings in der Historie, inklusive Playoff-Spiele. Spieler werden über
                  den Namen erkannt, bei abweichender Schreibweise erscheinen sie getrennt.
                </p>
              </div>
            </CardContent>
          </Card>

          <HeadToHeadCard sessions={sessions} records={records} year={year} />
        </div>
      )}
    </>,
  );
};

interface SortHeaderProps {
  column: Column;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (column: Column) => void;
  align?: 'left' | 'center';
}

function SortHeader({ column, sort, onSort, align = 'center' }: SortHeaderProps) {
  const active = sort.key === column.key;
  const Icon = !active ? ArrowUpDown : sort.direction === 'desc' ? ArrowDown : ArrowUp;
  return (
    <th
      className={cn('px-2 py-3', align === 'left' ? 'text-left' : 'text-center')}
      aria-sort={active ? (sort.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={column.title}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active && 'text-foreground',
        )}
      >
        {column.label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

export default Statistics;
