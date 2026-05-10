-- tmp写真削除24時間前のプッシュ通知（毎日 9:00 JST = 0:00 UTC）
--
-- 前提:
--   1. pg_cron と pg_net が有効になっていること（migration 003 と同じ）
--   2. send-tmp-cleanup-notifications Edge Function をデプロイ済みであること
--      `supabase functions deploy send-tmp-cleanup-notifications`

select cron.schedule(
  'send-tmp-cleanup-notifications',
  '0 0 * * *',  -- 毎日 0:00 UTC（9:00 JST）
  $$
  select
    net.http_post(
      url     := 'https://ngtfnebyrazjefiqxhbj.supabase.co/functions/v1/send-tmp-cleanup-notifications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer sb_publishable_GknPABzxtW4gvWTubY9_Cw_aLaaQoyi'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
