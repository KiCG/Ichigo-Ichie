-- photos.album_id を nullable に変更（tmp保存フロー対応）
alter table public.photos alter column album_id drop not null;
