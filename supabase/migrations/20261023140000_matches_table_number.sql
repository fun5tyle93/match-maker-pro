-- Speichert die Platte, auf der ein Trainingsabend-Spiel gespielt wird.
-- Alte Spiele bleiben null; die UI fällt dann auf die Listenposition zurück.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS table_number integer;
