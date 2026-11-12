-- Stores the running Swiss tournament (config, rounds, passes, referees, byes, playoff, lot) so that it survives a
-- browser restart and can be continued on another device. Finished tournaments keep using the normal tables.
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS swiss_state jsonb;
