alter table public.sheet_auto_connections
  add column if not exists selection jsonb;
