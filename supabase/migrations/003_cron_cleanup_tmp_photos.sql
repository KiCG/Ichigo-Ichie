-- tmp写真の自動削除（3日後）
--
-- 前提:
--   1. Supabase ダッシュボード → Database → Extensions で
--      pg_cron と pg_net を有効にすること
--   2. cleanup-tmp-photos Edge Function をデプロイ済みであること
--      `supabase functions deploy cleanup-tmp-photos`
--   3. url の <PROJECT_REF> と Authorization の <ANON_KEY> を実際の値に置き換えること
--      PROJECT_REF: ダッシュボード → Project Settings → General
--      ANON_KEY: ダッシュボード → Project Settings → API → anon (public) キー

select cron.schedule(
  'cleanup-tmp-photos',
  '0 2 * * *',  -- 毎日 2:00 UTC
  $$
  select
    net.http_post(
      url     := 'https://ngtfnebyrazjefiqxhbj.supabase.co/functions/v1/cleanup-tmp-photos',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndGZuZWJ5cmF6amVmaXF4aGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQyNTMsImV4cCI6MjA5MzYzMDI1M30.NeuBXG7vptH4xWJDUTTwGtyfnTtpw3CZ2GEW0kX5vCg'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
