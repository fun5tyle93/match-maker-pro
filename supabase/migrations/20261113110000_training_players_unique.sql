-- Removes exact duplicate players within an evening (same session, same player id, same name; the row with the
-- smallest id is kept) and prevents new ones. Matches are untouched; nothing references training_players.id.
DELETE FROM public.training_players t
USING public.training_players d
WHERE t.session_id = d.session_id
  AND t.player_id = d.player_id
  AND t.player_name = d.player_name
  AND t.id > d.id;

ALTER TABLE public.training_players
  ADD CONSTRAINT training_players_session_player_unique UNIQUE (session_id, player_id);
