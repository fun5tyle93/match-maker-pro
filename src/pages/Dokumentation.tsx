import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Trophy, Calendar, Users, BarChart2, FileDown, Shuffle,
  History, Shield, Search, BookOpen, RefreshCw, ArrowRightLeft,
  Table, Star, Settings, Lock, Globe, AlertCircle, CheckCircle2,
  ClockIcon
} from 'lucide-react';

type Status = 'Aktiv' | 'Neu' | 'In Planung';

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
      {
        icon: Calendar,
        title: 'Trainingsabende',
        description:
          'Verwalte Trainingsabende mit Spielerdaten, automatischer Paarungsgenerierung und Live-Ergebniseingabe. Ergebnisse können per Klick oder Enter-Taste bestätigt werden.',
        status: 'Aktiv',
      },
      {
        icon: Shuffle,
        title: 'Paarungsgenerator',
        description:
          'Generiert automatisch faire Paarungen für alle angemeldeten Spieler eines Trainingsabends nach dem Round-Robin-Prinzip.',
        status: 'Aktiv',
      },
      {
        icon: BarChart2,
        title: 'Live-Tabelle',
        description:
          'Zeigt die aktuelle Tagesrangliste eines Trainingsabends in Echtzeit an – inklusive Tore, Punkte und Differenz.',
        status: 'Aktiv',
      },
      {
        icon: RefreshCw,
        title: 'Training zurücksetzen',
        description:
          'Ermöglicht das Zurücksetzen eines laufenden Trainingsabends, um Spieler neu einzutragen oder Paarungen neu zu generieren.',
        status: 'Aktiv',
      },
    ],
  },
  {
    label: 'Ligen & Tabellen',
    features: [
      {
        icon: Trophy,
        title: 'Ligenverwaltung',
        description:
          'Erstelle und verwalte Meisterschaften (Saisons). Zeigt die vollständige Ligatabelle mit Siegen, Niederlagen, Toren und Punkten.',
        status: 'Aktiv',
      },
      {
        icon: ArrowRightLeft,
        title: 'Transfer zur Ewigen Tabelle',
        description:
          'Überträgt die Ergebnisse eines abgeschlossenen Trainingsabends direkt in die ewige Tabelle und aggregiert Statistiken korrekt.',
        status: 'Aktiv',
      },
      {
        icon: Table,
        title: 'Ewige Tabelle',
        description:
          'Die allzeitige Gesamtrangliste aller Spieler: Punkte, Siege, Niederlagen, Tordifferenz und Punkte gegen (Pkt−) über alle Saisons.',
        status: 'Aktiv',
      },
      {
        icon: Star,
        title: 'Meisterschafts-Highlights',
        description:
          'Zeigt Meister und Vize-Meister jeder Saison gesondert an und hebt besondere Leistungen hervor.',
        status: 'In Planung',
      },
    ],
  },
  {
    label: 'Historie & Auswertung',
    features: [
      {
        icon: History,
        title: 'Historienansicht',
        description:
          'Bietet einen Überblick über alle vergangenen Trainingsabende und Meisterschaften mit den jeweiligen Endständen.',
        status: 'Aktiv',
      },
      {
        icon: FileDown,
        title: 'PDF-Export',
        description:
          'Exportiert die aktuelle Tabelle oder den Spielplan als sauber formatiertes PDF, inklusive TKC71-Branding.',
        status: 'Aktiv',
      },
      {
        icon: Globe,
        title: 'Excel / CSV-Export',
        description:
          'Ermöglicht den Export von Statistiken und Tabellendaten im Excel-Format für externe Auswertungen.',
        status: 'Aktiv',
      },
    ],
  },
  {
    label: 'Benutzerverwaltung & Sicherheit',
    features: [
      {
        icon: Lock,
        title: 'Admin-Login',
        description:
          'Zugang zu administrativen Funktionen (Ergebnisse eintragen, Transfers, Ligas verwalten) über sicheres Supabase-Auth.',
        status: 'Aktiv',
      },
      {
        icon: Shield,
        title: 'Row Level Security (RLS)',
        description:
          'Alle Schreiboperationen auf die Datenbank sind serverseitig durch RLS-Policies geschützt – nur authentifizierte Nutzer dürfen Daten verändern.',
        status: 'Aktiv',
      },
      {
        icon: Users,
        title: 'Spielerverwaltung',
        description:
          'Spieler können pro Trainingsabend hinzugefügt oder entfernt werden. Ihre Statistiken werden separat pro Session gespeichert.',
        status: 'Aktiv',
      },
      {
        icon: Settings,
        title: 'Rollen & Berechtigungen',
        description:
          'Differenzierte Rollenvergabe (Admin / User) mit serverseitig erzwungenen Berechtigungen für sensible Aktionen.',
        status: 'In Planung',
      },
    ],
  },
  {
    label: 'In Entwicklung',
    features: [
      {
        icon: AlertCircle,
        title: 'Spieler-Profil',
        description:
          'Individuelles Profil pro Spieler mit vollständiger Karrierestatistik, Verlaufsdiagrammen und persönlichen Bestleistungen.',
        status: 'In Planung',
      },
      {
        icon: BarChart2,
        title: 'Statistik-Dashboard',
        description:
          'Interaktive Charts und Auswertungen: Formkurven, Tore pro Saison, Kopf-an-Kopf-Vergleiche und mehr.',
        status: 'In Planung',
      },
      {
        icon: ClockIcon,
        title: 'Echtzeit-Updates',
        description:
          'Live-Synchronisation der Ergebnisse und Tabellen über Supabase Realtime – für alle Endgeräte gleichzeitig.',
        status: 'In Planung',
      },
    ],
  },
];

const statusConfig: Record<Status, { label: string; className: string }> = {
  Aktiv: {
    label: 'Aktiv',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  Neu: {
    label: 'Neu',
    className: 'bg-accent/30 text-accent-foreground border-accent/40',
  },
  'In Planung': {
    label: 'In Planung',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export default function Dokumentation() {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? sections
        .map((section) => ({
          ...section,
          features: section.features.filter(
            (f) =>
              f.title.toLowerCase().includes(query.toLowerCase()) ||
              f.description.toLowerCase().includes(query.toLowerCase())
          ),
        }))
        .filter((s) => s.features.length > 0)
    : sections;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <div className="bg-gradient-hero py-10 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-8 h-8 text-primary-foreground" />
            <h1 className="text-4xl text-primary-foreground">Dokumentation</h1>
          </div>
          <p className="text-primary-foreground/80 text-base max-w-2xl">
            Übersicht aller Funktionen und Features des TKC71 Meisterschaftstools.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-10">
        {/* Suchleiste */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Funktion suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* Zusammenfassung */}
        {!query && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Funktionen gesamt', value: sections.flatMap((s) => s.features).length, icon: CheckCircle2, color: 'text-primary' },
              { label: 'Aktiv', value: sections.flatMap((s) => s.features).filter((f) => f.status === 'Aktiv').length, icon: CheckCircle2, color: 'text-green-600' },
              { label: 'In Planung', value: sections.flatMap((s) => s.features).filter((f) => f.status === 'In Planung').length, icon: ClockIcon, color: 'text-muted-foreground' },
              { label: 'Kategorien', value: sections.length, icon: BookOpen, color: 'text-accent-foreground' },
            ].map((stat) => (
              <Card key={stat.label} className="bg-card border-border shadow-card">
                <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                  <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
                  <div>
                    <p className="text-2xl font-bold text-foreground leading-none">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Sektionen */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Keine Funktionen gefunden für „{query}"</p>
          </div>
        ) : (
          filtered.map((section) => (
            <section key={section.label}>
              <h2 className="text-xl mb-4 text-foreground border-b border-border pb-2">
                {section.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.features.map((feature) => {
                  const Icon = feature.icon;
                  const { label, className: badgeCls } = statusConfig[feature.status];
                  return (
                    <Card
                      key={feature.title}
                      className="bg-card border-border shadow-card hover:shadow-glow transition-shadow duration-200 flex flex-col"
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="w-4 h-4 text-primary" />
                            </div>
                            <CardTitle className="text-sm font-semibold text-foreground leading-tight">
                              {feature.title}
                            </CardTitle>
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}
                          >
                            {label}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
