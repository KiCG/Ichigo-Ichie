-- タイムカプセル開封時に「共有先のユーザーにも通知する」かどうかを所有者が指定するためのフラグ。
-- デフォルト false（明示的にオプトインしない限り、共有先には通知されない）。
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS notify_shared boolean NOT NULL DEFAULT false;
