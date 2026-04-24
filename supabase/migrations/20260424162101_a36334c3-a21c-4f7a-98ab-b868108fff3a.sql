ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{
    "0": {"open": false, "from": "18:00", "to": "23:00"},
    "1": {"open": true,  "from": "18:00", "to": "23:00"},
    "2": {"open": true,  "from": "18:00", "to": "23:00"},
    "3": {"open": true,  "from": "18:00", "to": "23:00"},
    "4": {"open": true,  "from": "18:00", "to": "23:00"},
    "5": {"open": true,  "from": "18:00", "to": "23:00"},
    "6": {"open": true,  "from": "18:00", "to": "23:00"}
  }'::jsonb;