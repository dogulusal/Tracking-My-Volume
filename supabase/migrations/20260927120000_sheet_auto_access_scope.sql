-- Existing connections retain their broad grant. New app-created files use drive.file.
alter table public.sheet_auto_connections
  add column if not exists access_scope text not null default 'all'
  check (access_scope in ('all', 'app_files'));
