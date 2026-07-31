UPDATE public.training_sessions
SET name = COALESCE(name, 'Schweizer System vom 24.07.2026'),
    is_completed = true
WHERE id = '9f4d5036-a6d5-45f4-8c3c-fa21dac64d92';