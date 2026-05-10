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
        'Authorization', 'Bearer sb_publishable_GknPABzxtW4gvWTubY9_Cw_aLaaQoyi'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
