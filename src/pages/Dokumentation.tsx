import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MatchCard } from '@/components/MatchCard';
import { StandingsTable } from '@/components/StandingsTable';
import { PlayerInput } from '@/components/PlayerInput';
import { toast } from 'sonner';
import {
  Trophy, Calendar, Users, BarChart2, FileDown, Shuffle,
  History, Shield, Search, BookOpen, RefreshCw, ArrowRightLeft,
  Table, Star, Settings, Lock, Globe, AlertCircle, CheckCircle2,
  ClockIcon, Monitor, Tablet, Smartphone, Play,
} from 'lucide-react';
import type { Match, PlayerStats, Player } from '@/types';
import { cn } from '@/lib/utils';

/* ─────────────── Types ─────────────── */
type Status = 'Aktiv' | 'Neu' | 'In Planung';
type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const statusConfig: Record<Status, { label: string; className: string }> = {
  Aktiv:        { label: 'Aktiv',       className: 'bg-green-100 text-green-800 border-green-200' },
  Neu:          { label: 'Neu',         className: 'bg-accent/30 text-accent-foreground border-accent/40' },
  'In Planung': { label: 'In Planung',  className: 'bg-muted text-muted-foreground border-border' },
};

const viewportWidths: Record<ViewportSize, string> = {
  desktop: 'w-full',
  tablet:  'w-[640px]',
  mobile:  'w-[375px]',
};

/* ─────────────── Mock Data ─────────────── */
const MOCK_MATCH_PENDING: Match = {
  id: 'demo-1',
  round: 1,
  homePlayer: { id: 'p1', name: 'Max Müller' },
  awayPlayer:  { id: 'p2', name: 'Jan Bauer' },
  homeScore: null,
  awayScore: null,
  isCompleted: false,
};

const MOCK_MATCH_DONE: Match = {
  id: 'demo-2',
  round: 1,
  homePlayer: { id: 'p3', name: 'Anna Schmidt' },
  awayPlayer:  { id: 'p4', name: 'Tom Weber' },
  homeScore: 3,
  awayScore: 1,
  isCompleted: true,
};

const MOCK_STANDINGS: PlayerStats[] = [
  { player: { id: 'p1', name: 'Max Müller' },    wins: 5, draws: 1, losses: 1, goalsFor: 18, goalsAgainst: 8,  points: 11, pointsAgainst: 3,  goalDifference: 10 },
  { player: { id: 'p2', name: 'Anna Schmidt' },  wins: 4, draws: 2, losses: 1, goalsFor: 14, goalsAgainst: 9,  points: 10, pointsAgainst: 4,  goalDifference: 5  },
  { player: { id: 'p3', name: 'Jan Bauer' },     wins: 3, draws: 1, losses: 3, goalsFor: 11, goalsAgainst: 13, points: 7,  pointsAgainst: 7,  goalDifference: -2 },
  { player: { id: 'p4', name: 'Tom Weber' },     wins: 1, draws: 0, losses: 6, goalsFor: 7,  goalsAgainst: 20, points: 2,  pointsAgainst: 12, goalDifference: -13 },
];

const INITIAL_PLAYERS: Player[] = [
  { id: 'pp1', name: 'Max Müller' },
  { id: 'pp2', name: 'Anna Schmidt' },
];

/* ─────────────── Reusable Preview Shell ─────────────── */
interface PreviewShellProps {
  title: string;
  description: string;
  codeSnippet: string;
  children: React.ReactNode;
  hint?: string;
}

function PreviewShell({ title, description, codeSnippet, children, hint }: PreviewShellProps) {
  const [viewport, setViewport] = useState<ViewportSize>('desktop');

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <span className="font-semibold text-sm text-foreground">{title}</span>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
          {(['desktop', 'tablet', 'mobile'] as ViewportSize[]).map((vp) => {
            const Icon = vp === 'desktop' ? Monitor : vp === 'tablet' ? Tablet : Smartphone;
            return (
              <button
                key={vp}
                onClick={() => setViewport(vp)}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewport === vp
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={vp}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Live area */}
      <div className="bg-secondary/20 p-4 flex justify-center overflow-auto" style={{ minHeight: 120 }}>
        <div className={cn('transition-all duration-300', viewportWidths[viewport], 'overflow-hidden')}>
          {children}
        </div>
      </div>

      {hint && (
        <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center gap-2">
          <Play className="w-3 h-3 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      )}

      {/* Tabs: description + code */}
      <Tabs defaultValue="desc" className="border-t border-border">
        <TabsList className="w-full rounded-none bg-muted/40 justify-start h-9 px-4 gap-1">
          <TabsTrigger value="desc" className="text-xs h-7 px-3">Beschreibung</TabsTrigger>
          <TabsTrigger value="code" className="text-xs h-7 px-3">Code-Snippet</TabsTrigger>
        </TabsList>
        <TabsContent value="desc" className="px-4 py-3 m-0">
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </TabsContent>
        <TabsContent value="code" className="m-0">
          <pre className="px-4 py-3 text-[11px] leading-relaxed overflow-x-auto bg-muted/60 text-foreground font-mono whitespace-pre-wrap">
            {codeSnippet.trim()}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────────── Stats summary widget ─────────────── */
function StatsWidget() {
  const items = [
    { label: 'Trainingsabende', value: 24, icon: Calendar, color: 'text-primary' },
    { label: 'Gespielte Matches', value: 312, icon: Trophy, color: 'text-yellow-600' },
    { label: 'Aktive Spieler', value: 12, icon: Users, color: 'text-green-600' },
    { label: 'Ø Tore/Match', value: '4.2', icon: BarChart2, color: 'text-blue-500' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((s) => (
        <div key={s.label} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <s.icon className={cn('w-5 h-5 shrink-0', s.color)} />
          <div>
            <p className="text-xl font-bold text-foreground leading-none">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── PlayerInput demo (isolated state) ─────────────── */
function PlayerInputDemo() {
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const add = (name: string) => {
    setPlayers((prev) => [...prev, { id: `demo-${Date.now()}`, name }]);
    toast.success(`Spieler "${name}" hinzugefügt`);
  };
  const remove = (id: string) => setPlayers((prev) => prev.filter((p) => p.id !== id));
  return <PlayerInput players={players} onAddPlayer={add} onRemovePlayer={remove} />;
}

/* ─────────────── MatchCard demo (isolated state) ─────────────── */
function MatchCardDemo() {
  const [match, setMatch] = useState<Match>(MOCK_MATCH_PENDING);
  const updateScore = (_: string, home: number, away: number) => {
    setMatch((prev) => ({ ...prev, homeScore: home, awayScore: away, isCompleted: true }));
    toast.success(`Ergebnis gespeichert: ${home}:${away}`);
  };
  return <MatchCard match={match} onUpdateScore={updateScore} />;
}

/* ─────────────── Static sections data (feature cards) ─────────────── */
interface DocFeature {
  icon: React.ElementType;
  title: string;
  description: string;
  status: Status;
}

interface DocSection {
  label: string;
  features: DocFeature[];
}

const sections: DocSection[] = [
  {
    label: 'Kernfunktionen',
    features: [
      { icon: Calendar,        title: 'Trainingsabende',        description: 'Verwalte Trainingsabende mit Spielerdaten, automatischer Paarungsgenerierung und Live-Ergebniseingabe. Ergebnisse können per Klick oder Enter-Taste bestätigt werden.', status: 'Aktiv' },
      { icon: Shuffle,         title: 'Paarungsgenerator',      description: 'Generiert automatisch faire Paarungen für alle angemeldeten Spieler eines Trainingsabends nach dem Round-Robin-Prinzip.', status: 'Aktiv' },
      { icon: BarChart2,       title: 'Live-Tabelle',           description: 'Zeigt die aktuelle Tagesrangliste eines Trainingsabends in Echtzeit an – inklusive Tore, Punkte und Differenz.', status: 'Aktiv' },
      { icon: RefreshCw,       title: 'Training zurücksetzen',  description: 'Ermöglicht das Zurücksetzen eines laufenden Trainingsabends, um Spieler neu einzutragen oder Paarungen neu zu generieren.', status: 'Aktiv' },
    ],
  },
  {
    label: 'Ligen & Tabellen',
    features: [
      { icon: Trophy,          title: 'Ligenverwaltung',         description: 'Erstelle und verwalte Meisterschaften (Saisons). Zeigt die vollständige Ligatabelle mit Siegen, Niederlagen, Toren und Punkten.', status: 'Aktiv' },
      { icon: ArrowRightLeft,  title: 'Transfer zur Ewigen Tabelle', description: 'Überträgt die Ergebnisse eines abgeschlossenen Trainingsabends direkt in die ewige Tabelle und aggregiert Statistiken korrekt.', status: 'Aktiv' },
      { icon: Table,           title: 'Ewige Tabelle',           description: 'Die allzeitige Gesamtrangliste aller Spieler: Punkte, Siege, Niederlagen, Tordifferenz und Punkte gegen (Pkt−) über alle Saisons.', status: 'Aktiv' },
      { icon: Star,            title: 'Meisterschafts-Highlights', description: 'Zeigt Meister und Vize-Meister jeder Saison gesondert an und hebt besondere Leistungen hervor.', status: 'In Planung' },
    ],
  },
  {
    label: 'Historie & Auswertung',
    features: [
      { icon: History,         title: 'Historienansicht',  description: 'Bietet einen Überblick über alle vergangenen Trainingsabende und Meisterschaften mit den jeweiligen Endständen.', status: 'Aktiv' },
      { icon: FileDown,        title: 'PDF-Export',        description: 'Exportiert die aktuelle Tabelle oder den Spielplan als sauber formatiertes PDF, inklusive TKC71-Branding.', status: 'Aktiv' },
      { icon: Globe,           title: 'Excel / CSV-Export', description: 'Ermöglicht den Export von Statistiken und Tabellendaten im Excel-Format für externe Auswertungen.', status: 'Aktiv' },
    ],
  },
  {
    label: 'Benutzerverwaltung & Sicherheit',
    features: [
      { icon: Lock,    title: 'Admin-Login',              description: 'Zugang zu administrativen Funktionen über sicheres Supabase-Auth.', status: 'Aktiv' },
      { icon: Shield,  title: 'Row Level Security (RLS)', description: 'Alle Schreiboperationen sind serverseitig durch RLS-Policies geschützt – nur authentifizierte Nutzer dürfen Daten verändern.', status: 'Aktiv' },
      { icon: Users,   title: 'Spielerverwaltung',        description: 'Spieler können pro Trainingsabend hinzugefügt oder entfernt werden. Ihre Statistiken werden separat pro Session gespeichert.', status: 'Aktiv' },
      { icon: Settings, title: 'Rollen & Berechtigungen', description: 'Differenzierte Rollenvergabe (Admin / User) mit serverseitig erzwungenen Berechtigungen für sensible Aktionen.', status: 'In Planung' },
    ],
  },
  {
    label: 'In Entwicklung',
    features: [
      { icon: AlertCircle, title: 'Spieler-Profil',          description: 'Individuelles Profil pro Spieler mit vollständiger Karrierestatistik, Verlaufsdiagrammen und persönlichen Bestleistungen.', status: 'In Planung' },
      { icon: BarChart2,   title: 'Statistik-Dashboard',     description: 'Interaktive Charts und Auswertungen: Formkurven, Tore pro Saison, Kopf-an-Kopf-Vergleiche und mehr.', status: 'In Planung' },
      { icon: ClockIcon,   title: 'Echtzeit-Updates',        description: 'Live-Synchronisation der Ergebnisse und Tabellen über Supabase Realtime – für alle Endgeräte gleichzeitig.', status: 'In Planung' },
    ],
  },
];

/* ─────────────── Main page ─────────────── */
export default function Dokumentation() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'uebersicht' | 'previews'>('uebersicht');

  const filtered = query.trim()
    ? sections
        .map((s) => ({ ...s, features: s.features.filter((f) => f.title.toLowerCase().includes(query.toLowerCase()) || f.description.toLowerCase().includes(query.toLowerCase())) }))
        .filter((s) => s.features.length > 0)
    : sections;

  const allFeatures = sections.flatMap((s) => s.features);
  const activeCount = allFeatures.filter((f) => f.status === 'Aktiv').length;
  const planningCount = allFeatures.filter((f) => f.status === 'In Planung').length;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ── Hero ── */}
      <div className="bg-gradient-hero py-10 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-8 h-8 text-primary-foreground" />
            <h1 className="text-4xl text-primary-foreground">Dokumentation</h1>
          </div>
          <p className="text-primary-foreground/80 text-base max-w-2xl">
            Übersicht aller Funktionen und interaktive Live-Previews des TKC71 Meisterschaftstools.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-8">

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Funktion suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* ── Summary stats ── */}
        {!query && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Funktionen gesamt', value: allFeatures.length,   icon: CheckCircle2, color: 'text-primary' },
              { label: 'Aktiv',             value: activeCount,           icon: CheckCircle2, color: 'text-green-600' },
              { label: 'In Planung',        value: planningCount,         icon: ClockIcon,    color: 'text-muted-foreground' },
              { label: 'Kategorien',        value: sections.length,       icon: BookOpen,     color: 'text-accent-foreground' },
            ].map((stat) => (
              <Card key={stat.label} className="bg-card border-border shadow-card">
                <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                  <stat.icon className={cn('w-5 h-5 shrink-0', stat.color)} />
                  <div>
                    <p className="text-2xl font-bold text-foreground leading-none">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Main tab switcher ── */}
        {!query && (
          <div className="flex gap-2 border-b border-border pb-0">
            {(['uebersicht', 'previews'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t === 'uebersicht' ? '📋 Funktionsübersicht' : '🎮 Live-Previews'}
              </button>
            ))}
          </div>
        )}

        {/* ════════════════ ÜBERSICHT tab ════════════════ */}
        {(activeTab === 'uebersicht' || query) && (
          filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Keine Funktionen gefunden für „{query}"</p>
            </div>
          ) : (
            <div className="space-y-10">
              {filtered.map((section) => (
                <section key={section.label}>
                  <h2 className="text-xl mb-4 text-foreground border-b border-border pb-2">{section.label}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {section.features.map((feature) => {
                      const Icon = feature.icon;
                      const { label, className: badgeCls } = statusConfig[feature.status];
                      return (
                        <Card key={feature.title} className="bg-card border-border shadow-card hover:shadow-glow transition-shadow duration-200 flex flex-col">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-primary/10">
                                  <Icon className="w-4 h-4 text-primary" />
                                </div>
                                <CardTitle className="text-sm font-semibold text-foreground leading-tight">{feature.title}</CardTitle>
                              </div>
                              <span className={cn('shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', badgeCls)}>
                                {label}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )
        )}

        {/* ════════════════ LIVE-PREVIEWS tab ════════════════ */}
        {activeTab === 'previews' && !query && (
          <div className="space-y-8">

            {/* 1 – Ergebniseingabe */}
            <div>
              <h2 className="text-xl mb-4 text-foreground border-b border-border pb-2">Spielpaarung & Ergebniseingabe</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PreviewShell
                  title="Offene Paarung"
                  description="Spieler tragen ihr Ergebnis direkt in die Eingabefelder ein. Enter oder Klick auf ›Speichern‹ bestätigt das Ergebnis. Ungültige Eingaben werden abgewiesen."
                  hint="Trage ein Ergebnis ein und drücke Enter oder klicke Speichern."
                  codeSnippet={`<MatchCard
  match={match}
  onUpdateScore={(id, home, away) =>
    updateScore(id, home, away)
  }
/>`}
                >
                  <MatchCardDemo />
                </PreviewShell>

                <PreviewShell
                  title="Abgeschlossene Partie"
                  description="Eine bereits eingetragene Partie wird read-only angezeigt. Der Sieger wird farblich hervorgehoben. Über ›Bearbeiten‹ kann das Ergebnis korrigiert werden."
                  hint="Klicke auf ›Bearbeiten‹, um das Ergebnis zu ändern."
                  codeSnippet={`<MatchCard
  match={completedMatch}
  onUpdateScore={handleUpdate}
  readonly={false}
/>`}
                >
                  <MatchCard
                    match={MOCK_MATCH_DONE}
                    onUpdateScore={(_id, h, a) => toast.success(`Geändert: ${h}:${a}`)}
                  />
                </PreviewShell>
              </div>
            </div>

            {/* 2 – Spielerverwaltung */}
            <div>
              <h2 className="text-xl mb-4 text-foreground border-b border-border pb-2">Spielerverwaltung</h2>
              <PreviewShell
                title="Spieler hinzufügen & entfernen"
                description="Über das Eingabefeld können neue Spieler für einen Trainingsabend erfasst werden. Per Klick auf ✕ wird ein Spieler entfernt. Änderungen triggern einen Toast als visuelles Feedback."
                hint="Gib einen Namen ein und drücke ＋ um einen Spieler hinzuzufügen."
                codeSnippet={`<PlayerInput
  players={players}
  onAddPlayer={(name) => addPlayer(name)}
  onRemovePlayer={(id) => removePlayer(id)}
/>`}
              >
                <PlayerInputDemo />
              </PreviewShell>
            </div>

            {/* 3 – Tabellen */}
            <div>
              <h2 className="text-xl mb-4 text-foreground border-b border-border pb-2">Tabellen & Rangliste</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PreviewShell
                  title="Tagesrangliste"
                  description="Die StandingsTable-Komponente rendert automatisch Gold/Silber/Bronze-Highlights für die Plätze 1–3. Spalten: Punkte (Pkt+:Pkt−), Tore und Tordifferenz."
                  codeSnippet={`<StandingsTable
  stats={playerStats}
  title="Tagesrangliste"
/>`}
                >
                  <StandingsTable stats={MOCK_STANDINGS} title="Tagesrangliste" />
                </PreviewShell>

                <PreviewShell
                  title="Dashboard-Widget (Stats)"
                  description="Kompaktes Übersichts-Widget mit aggregierten Kennzahlen: Trainingstage, gespielte Matches, aktive Spieler und Tore pro Match."
                  codeSnippet={`// Miniatur-Statistik-Dashboard
<div className="grid grid-cols-2 gap-3">
  {stats.map(s => (
    <StatCard key={s.label} {...s} />
  ))}
</div>`}
                >
                  <StatsWidget />
                </PreviewShell>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
