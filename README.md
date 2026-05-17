# 一期一会 (Ichigo-Ichie)

> 「その時、その場所で、何を思った？」

過去に写真を撮った同じ場所へ再び訪れ、同じ風景をカメラで捉えたときだけ、過去の自分が残したメッセージのロックが解除される思い出記録アプリ。

---

## 概要

写真に紐付けた日記メッセージは、撮影地点の半径 100m 以内（GPS 誤差を考慮して調整）で再撮影し、AI が同じロケーションと判定するまで読めない。「不便を楽しむ」ことで再訪の動機と再会の感動を生み出す。

---

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| フロントエンド | React Native (Expo SDK 54) + TypeScript |
| バックエンド / DB | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| 画像認識 AI | Google Gemini 2.5 Flash (Supabase Edge Functions 経由) |
| 位置情報 | expo-location |
| カメラ | expo-camera |
| プッシュ通知 | expo-notifications |
| ナビゲーション | React Navigation v7 (Native Stack + Bottom Tabs) |

---

## セットアップ

### 前提条件

- Node.js v18 以上
- Expo Go アプリ（iOS）
- Supabase プロジェクト
- Google AI Studio の API キー（Gemini）

### インストール

```bash
git clone <repo-url>
cd ichigo-ichie
npm install
```

### 環境変数

プロジェクトルートに `.env` を作成：

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### Supabase のセットアップ

Supabase ダッシュボードの SQL Editor で以下のマイグレーションを順番に実行：

```
supabase/migrations/001_initial.sql
supabase/migrations/002_photos_album_id_nullable.sql
supabase/migrations/003_cron_cleanup_tmp_photos.sql
supabase/migrations/004_add_push_token.sql
supabase/migrations/005_cron_send_notifications.sql
supabase/migrations/006_add_desk_album.sql
supabase/migrations/007_add_bookshelves.sql
supabase/migrations/008_add_unlock_record_id_to_messages.sql
supabase/migrations/009_album_sharing.sql
supabase/migrations/010_share_settings.sql
supabase/migrations/011_add_memory_image_url.sql
supabase/migrations/012_add_unlock_at.sql
supabase/migrations/013_cron_scheduled_notifications.sql
```

Storage に `photos` バケットを作成し **Public** に設定後、以下の RLS ポリシーを追加：

```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos');

CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'photos');
```

### Edge Function のデプロイ

```bash
supabase login
supabase link --project-ref <your-project-ref>

# Gemini API キーを設定
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>

# デプロイ
supabase functions deploy check-image
supabase functions deploy cleanup-tmp-photos
supabase functions deploy send-tmp-cleanup-notifications
```

### 起動

```bash
npx expo start
```

Expo Go アプリで QR コードを読み取る。

---

## 機能一覧

### 実装済み

| 機能 | 説明 |
|---|---|
| 認証 | メール / パスワードによるログイン・新規登録 |
| カメラ撮影 | GPS 座標・撮影日時を自動取得して写真に紐付け。ピンチ操作でズーム（1〜10×） |
| 現像待ち | メッセージ未記入の写真を 3 日間保持。残り日数バッジ付き一覧表示 |
| 写真の自動削除 | 3 日経過した現像待ち写真を毎日自動削除（pg_cron） |
| プッシュ通知（削除前） | 削除 24〜48 時間前に件数まとめ通知を送信（pg_cron） |
| メッセージ保存 | 写真にメッセージを添えてアルバムへ保存。机の上への保存も可能 |
| タイムカプセル | メッセージ保存時に開封日を指定してロック。指定日の朝 9 時にプッシュ通知（pg_cron） |
| 机の上 | メッセージ付きだがアルバム未整理の写真を置く専用スペース |
| アルバム | 写真のグループ。作成・削除・写真の移動に対応 |
| アルバム共有 | 共有コード（UUID）と QR コードを生成して他ユーザーにアルバムを共有。メッセージ相互表示・写真追加の許可を設定可能。写真はロック状態で共有され、受信者も同じ場所へ再訪することでロック解除可能 |
| 本棚 | アルバムをまとめるグループ。作成・削除・アルバムの移動に対応 |
| 近くの思い出マップ | 全件取得 + supercluster によるクラスタリング表示。ズームに応じてアイコンサイズが変化 |
| ロック解除 | GPS 100m 以内（誤差補正あり）で再撮影 → AI 判定 → メッセージ開示（7日間有効） |
| 訪問記録 | ロック解除ごとに訪問写真とメッセージを記録。7日以内なら編集可能、期限後は再訪で新規追加 |
| 撮影直後の編集 | 撮影から 3 日以内はロック解除なしで元メッセージを閲覧・編集可能 |
| 写真の拡大表示 | 各画面（アルバム・ロック解除・現像待ち・メッセージ入力）で写真をタップすると全画面表示 |
| 設定 | カメラロール保存方式の選択・ログアウト・表示名の編集・共有アルバムの追加 |

### 未実装・課題

#### アルバム共有

| 項目 | 詳細 |
|---|---|
| 共有の取り消し UI がない | 共有した側がアルバム長押しメニューから「誰と共有しているか確認する」「共有を取り消す」操作ができない。DB の RLS（`album_shares_all_by_sharer`）は対応済みのため、UI の追加のみで実装可能 |
| MemoriesScreen に共有アルバムが表示されない | 受け取った共有アルバムは `AlbumListScreen`（すべて見る）に移動しないと確認できない。`MemoriesScreen` のアルバム取得クエリが `eq('user_id', user.id)` のみで、`shared_to_user_id` のレコードを含んでいないため |
| `can_add_photos` が DB レベルで強制されていない | `photos` テーブルの INSERT ポリシー（`photos_all_own`）は `user_id = auth.uid()` しか検証しない。`can_add_photos = false` でも API を直接呼び出せば共有アルバムに写真を追加できる。UI 側の制御のみで対応中のため、以下のポリシーを追加するべき：<br>```sql<br>create policy "photos_insert_shared" on public.photos for insert<br>  with check (<br>    auth.uid() = user_id and (<br>      exists (select 1 from albums where id = photos.album_id and user_id = auth.uid())<br>      or exists (<br>        select 1 from album_shares<br>        where album_id = photos.album_id<br>          and shared_to_user_id = auth.uid()<br>          and can_add_photos = true<br>      )<br>    )<br>  );<br>``` |
| 共有アルバムへの写真追加が非直感的 | `can_add_photos = true` で共有されたアルバムを開いても「写真を追加」ボタンが存在しない。追加にはカメラ撮影 → `WriteMessageScreen` でアルバムを選択する必要があり、受け取った側には気づきにくい |

#### その他の機能不足

| 項目 | 詳細 |
|---|---|
| 共有アルバムの本棚整理 | 他ユーザーから共有されたアルバムを本棚に追加できない（自分のアルバムのみ対応） |
| 撮影後のプレビュー・撮り直し | 撮影直後に確認なしで即アップロードされる。撮り直しができない |
| フラッシュ切り替え | カメラ画面にフラッシュ ON/OFF がない |
| 長押しメニューのヒント | `AlbumListScreen` ・ `BookshelfDetailScreen` の長押し操作が UI 上で発見しにくい |

#### 将来的な拡張
| 項目 | 詳細 |
|---|---|
| フリーミアム制限 | 写真枚数・アルバム数の上限設定と課金導線 |
| 魔法の鍵 | 強制ロック解除のアイテム課金 |

---

## 画面構成

```
MainTabs (4タブ)
├── マップ (HomeTab)
│   ├── NearbyScreen          — 近くの思い出マップ（クラスタリング）
│   └── UnlockCameraScreen    — ロック解除カメラ
├── 思い出 (MemoriesTab)
│   ├── MemoriesScreen        — 現像待ち・机・アルバム・本棚のハブ
│   ├── TmpAlbumScreen        — 直近 3 日間の未整理写真一覧
│   ├── WriteMessageScreen    — メッセージ入力・アルバム保存・タイムカプセル設定
│   ├── DeskScreen            — 机の上（未整理写真の一時置き場）
│   ├── AlbumListScreen       — 全アルバム一覧・共有・本棚整理
│   ├── AlbumDetailScreen     — アルバム内写真一覧・メッセージ・訪問記録
│   ├── BookshelfScreen       — 本棚一覧・作成
│   └── BookshelfDetailScreen — 本棚内アルバム一覧
├── 撮る (CameraTab)
│   └── CaptureScreen         — 撮影画面（ピンチズーム対応）
└── その他 (SettingsTab)
    └── SettingsScreen        — カメラロール設定・ログアウト
```

---

## データベース設計

| テーブル | 役割 |
|---|---|
| `users` | ユーザー情報（auth.users と同期）、push_token を保持 |
| `bookshelves` | アルバムをまとめる本棚 |
| `albums` | 写真のグループ。`is_desk` フラグで机アルバムを識別 |
| `photos` | 写真 URL・GPS 座標・撮影日時。`album_id` が NULL の間は現像待ち |
| `messages` | 写真に紐付くメッセージ（`is_original` で元メッセージと訪問記録を区別、`unlock_record_id` で訪問ごとに 1 件に制限）|
| `unlock_records` | ロック解除済み記録 |

---

## ロック解除フロー

```
ユーザーが地図でピンをタップ
        ↓
GPS チェック（実距離 − GPS 誤差 ≦ 100m？）
        ↓ Yes
カメラ起動（右上に元写真のサムネイルを表示）
        ↓ 撮影
unlock 写真を Storage にアップロード
        ↓
Supabase Edge Function (check-image) 呼び出し
        ↓
Gemini 2.5 Flash が背景・ロケーションを比較
        ↓ matched: true
unlock_records に記録 → メッセージを表示（7日間有効）
        ↓ 7日経過
自動的に再ロック → 再訪で新しい訪問記録を追加可能
```

---

## カメラロール保存設定

設定画面から以下の 3 択を選択可能（デフォルト: すべて保存）：

| 設定値 | 動作 |
|---|---|
| すべての写真を保存 | 撮影直後にカメラロールへ保存 |
| メッセージ付きのみ保存 | メッセージを保存したタイミングでカメラロールへ保存 |
| 保存しない | カメラロールへは保存しない |
