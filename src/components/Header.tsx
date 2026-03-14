import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { Trophy, Calendar, Home, History, LogOut, LogIn, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TippKickBall } from './TippKickBall';
import tkc71Logo from '@/assets/tkc71-logo.jpeg';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function Header() {
  const { isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const linkClass = "flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm";
  const activeClass = "bg-primary/20 text-primary";
  const inactiveClass = "text-muted-foreground hover:text-foreground hover:bg-secondary";

  const handleSignOut = async () => {
    await signOut();
    toast.success('Abgemeldet');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <RouterNavLink to="/" className="flex items-center gap-3 group">
            <TippKickBall size="md" className="group-hover:scale-110 transition-transform" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="font-display text-lg tracking-wide text-foreground">
                TIPP-KICK MEISTERSCHAFTSTOOL
              </span>
              <img 
                src={tkc71Logo} 
                alt="TKC71 Hirschlanden" 
                className="h-8 w-8 rounded-full object-cover opacity-80"
              />
            </div>
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
              to="/history"
              className={({ isActive }) => cn(linkClass, isActive ? activeClass : inactiveClass)}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Historie</span>
            </RouterNavLink>
            <RouterNavLink
              to="/leagues"
              className={({ isActive }) => cn(linkClass, isActive ? activeClass : inactiveClass)}
            >
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">Ligen</span>
            </RouterNavLink>

            {isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="gap-2 text-muted-foreground hover:text-foreground ml-1"
                title="Abmelden"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="gap-2 text-muted-foreground hover:text-foreground ml-1"
                title="Admin-Login"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Admin</span>
              </Button>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
