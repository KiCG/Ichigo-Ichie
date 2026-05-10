-- tmp写真の自動削除（3日後）
--
-- 前提:
--   1. Supabase ダッシュボード → Database → Extensions で
--      pg_cron と pg_net を有効にすること
--   2. cleanup-tmp-photos Edge Function をデプロイ済みであること
--      `supabase functions deploy cleanup-tmp-photos`
--   3. <PROJECT_REF> と <SERVICE_ROLE_KEY> を実際の値に置き換えること
--      PROJECT_REF: ダッシュボード → Project Settings → General
--      SERVICE_ROLE_KEY: ダッシュボード → Project Settings → API

select cron.schedule(
  'cleanup-tmp-photos',
  '0 2 * * *',  -- 毎日 2:00 UTC
  $$
  select
    net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-tmp-photos',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
