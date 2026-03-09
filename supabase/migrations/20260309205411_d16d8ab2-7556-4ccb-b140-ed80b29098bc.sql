-- Drop existing policies and replace with proper PERMISSIVE policies
-- that explicitly block anonymous writes

-- ============ current_session ============
DROP POLICY IF EXISTS "Jeder darf lesen" ON public.current_session;
DROP POLICY IF EXISTS "Nur Admins dürfen ändern" ON public.current_session;
CREATE POLICY "Public read current_session" ON public.current_session FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write current_session" ON public.current_session FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ leagues ============
DROP POLICY IF EXISTS "Jeder darf lesen" ON public.leagues;
DROP POLICY IF EXISTS "Nur Admins dürfen ändern" ON public.leagues;
CREATE POLICY "Public read leagues" ON public.leagues FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write leagues" ON public.leagues FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ matches ============
DROP POLICY IF EXISTS "Jeder darf lesen" ON public.matches;
DROP POLICY IF EXISTS "Nur Admins dürfen ändern" ON public.matches;
CREATE POLICY "Public read matches" ON public.matches FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write matches" ON public.matches FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ player_stats ============
DROP POLICY IF EXISTS "Jeder darf lesen" ON public.player_stats;
DROP POLICY IF EXISTS "Nur Admins dürfen ändern" ON public.player_stats;
CREATE POLICY "Public read player_stats" ON public.player_stats FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write player_stats" ON public.player_stats FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ training_players ============
DROP POLICY IF EXISTS "Jeder darf lesen" ON public.training_players;
DROP POLICY IF EXISTS "Nur Admins dürfen ändern" ON public.training_players;
CREATE POLICY "Public read training_players" ON public.training_players FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write training_players" ON public.training_players FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ training_sessions ============
DROP POLICY IF EXISTS "Jeder darf lesen" ON public.training_sessions;
DROP POLICY IF EXISTS "Nur Admins dürfen ändern" ON public.training_sessions;
CREATE POLICY "Public read training_sessions" ON public.training_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write training_sessions" ON public.training_sessions FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');