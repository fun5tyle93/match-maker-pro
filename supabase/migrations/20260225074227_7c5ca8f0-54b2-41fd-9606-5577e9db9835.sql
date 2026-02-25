
-- Leagues table
CREATE TABLE public.leagues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Player stats per league
CREATE TABLE public.player_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_id UUID NOT NULL DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  goals_for INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  points_against INTEGER NOT NULL DEFAULT 0,
  goal_difference INTEGER NOT NULL DEFAULT 0,
  championships INTEGER NOT NULL DEFAULT 0,
  vice_championships INTEGER NOT NULL DEFAULT 0
);

-- Training sessions
CREATE TABLE public.training_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  round_count INTEGER NOT NULL DEFAULT 0,
  matches_per_pairing INTEGER NOT NULL DEFAULT 1,
  transferred_to_leagues TEXT[] DEFAULT '{}'
);

-- Players in a training session
CREATE TABLE public.training_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name TEXT NOT NULL
);

-- Matches in a training session
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  home_player_id UUID NOT NULL,
  home_player_name TEXT NOT NULL,
  away_player_id UUID NOT NULL,
  away_player_name TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  is_completed BOOLEAN NOT NULL DEFAULT false
);

-- Current session marker (only one row)
CREATE TABLE public.current_session (
  id INTEGER NOT NULL DEFAULT 1 PRIMARY KEY CHECK (id = 1),
  session_id UUID REFERENCES public.training_sessions(id) ON DELETE SET NULL
);
INSERT INTO public.current_session (id, session_id) VALUES (1, NULL);

-- Enable RLS but allow all access (no auth in this app)
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.leagues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.player_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.training_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.training_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.current_session FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_player_stats_league ON public.player_stats(league_id);
CREATE INDEX idx_training_players_session ON public.training_players(session_id);
CREATE INDEX idx_matches_session ON public.matches(session_id);
