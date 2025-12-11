import { useNavigate } from 'react-router-dom';
import { Play, Trophy, Calendar, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/Header';

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Users,
      title: "Spieler verwalten",
      description: "Einfache Erfassung beliebig vieler Spieler"
    },
    {
      icon: Zap,
      title: "Auto-Paarungen",
      description: "Faire, zufällige Spielpaarungen generieren"
    },
    {
      icon: Calendar,
      title: "Live-Tabelle",
      description: "Echtzeit-Aktualisierung der Ergebnisse"
    },
    {
      icon: Trophy,
      title: "Jahresligen",
      description: "Langfristige Statistiken über mehrere Abende"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 md:py-16">
        {/* Hero Section */}
        <section className="text-center mb-16 animate-fade-in">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-primary shadow-glow animate-pulse-glow mb-6">
              <span className="text-4xl">⚽</span>
            </div>
          </div>
          
          <h1 className="font-display text-4xl md:text-6xl tracking-wide mb-4">
            KICKER{' '}
            <span className="text-gradient-primary">TRAINER</span>
          </h1>
          
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-8">
            Verwalte deine Tischfußball-Trainingsabende, generiere faire Paarungen 
            und führe Jahresligen mit automatischer Punkteberechnung.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              variant="hero"
              size="xl"
              onClick={() => navigate('/training')}
              className="gap-2"
            >
              <Play className="w-5 h-5" />
              Training starten
            </Button>
            <Button
              variant="outline"
              size="xl"
              onClick={() => navigate('/leagues')}
              className="gap-2"
            >
              <Trophy className="w-5 h-5" />
              Ligen ansehen
            </Button>
          </div>
        </section>

        {/* Features Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="group hover:border-primary/50 hover:shadow-glow transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Quick Stats */}
        <section className="mt-16 text-center">
          <p className="text-muted-foreground text-sm">
            Punktesystem: Sieg = 2 Punkte • Unentschieden = 1 Punkt • Niederlage = 0 Punkte
          </p>
        </section>
      </main>
    </div>
  );
};

export default Index;
