import { NavLink as RouterNavLink } from 'react-router-dom';
import { Trophy, Calendar, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Header() {
  const linkClass = "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200";
  const activeClass = "bg-primary/20 text-primary";
  const inactiveClass = "text-muted-foreground hover:text-foreground hover:bg-secondary";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <RouterNavLink to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-[hsl(160,84%,39%)] to-[hsl(160,84%,30%)] flex items-center justify-center shadow-[0_0_30px_hsl(160_84%_39%_/_0.2)] group-hover:scale-110 transition-transform">
              <span className="text-xl">⚽</span>
            </div>
            <span className="font-display text-xl tracking-wide hidden sm:block">
              KICKER TRAINER
            </span>
          </RouterNavLink>

          <nav className="flex items-center gap-1">
            <RouterNavLink
              to="/"
              end
              className={({ isActive }) => cn(linkClass, isActive ? activeClass : inactiveClass)}
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Start</span>
            </RouterNavLink>
            <RouterNavLink
              to="/training"
              className={({ isActive }) => cn(linkClass, isActive ? activeClass : inactiveClass)}
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Training</span>
            </RouterNavLink>
            <RouterNavLink
              to="/leagues"
              className={({ isActive }) => cn(linkClass, isActive ? activeClass : inactiveClass)}
            >
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">Ligen</span>
            </RouterNavLink>
          </nav>
        </div>
      </div>
    </header>
  );
}
