-- Run once in Supabase SQL Editor after replacing the two placeholders.
-- Keep the worker key out of the repository and use the same value as the
-- SHEET_SYNC_WORKER_SECRET Edge Function secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'sheet_auto_project_url');
select vault.create_secret('YOUR_WORKER_SECRET', 'sheet_auto_worker_key');

select cron.schedule('sheets-auto-sync', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sheet_auto_project_url') || '/functions/v1/sheets-auto-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-key', (select decrypted_secret from vault.decrypted_secrets where name = 'sheet_auto_worker_key')
    ),
    body := '{"action":"run"}'::jsonb
  );
$$);
