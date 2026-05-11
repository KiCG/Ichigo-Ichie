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
| カメラ撮影 | GPS 座標・撮影日時を自動取得して写真に紐付け |
| 現像待ち | メッセージ未記入の写真を 3 日間保持。残り日数バッジ付き一覧表示 |
| 写真の自動削除 | 3 日経過した現像待ち写真を毎日自動削除（pg_cron） |
| プッシュ通知 | 削除 24〜48 時間前に件数まとめ通知を送信（pg_cron） |
| メッセージ保存 | 写真にメッセージを添えてアルバムへ保存。机の上への保存も可能 |
| 机の上 | メッセージ付きだがアルバム未整理の写真を置く専用スペース |
| アルバム | 写真のグループ。作成・削除・写真の移動に対応 |
| 本棚 | アルバムをまとめるグループ。作成・削除・アルバムの移動に対応 |
| 近くの思い出マップ | 現在地から半径 5km 以内の思い出を地図上にピン表示 |
| ロック解除 | GPS 100m 以内（誤差補正あり）で再撮影 → AI 判定 → メッセージ開示（7日間有効） |
| 訪問記録 | ロック解除ごとに 1 件のメッセージを記録。7日以内なら編集可能、期限後は再訪で新規追加 |
| 撮影直後の編集 | 撮影から 3 日以内はロック解除なしで元メッセージを閲覧・編集可能 |
| 設定 | カメラロール保存方式の選択・ログアウト |

### 未実装（今後の予定）

- フリーミアム制限の適用（写真枚数・アルバム数上限）
- フリーミアム制限の適用（写真枚数・アルバム数上限）
- 魔法の鍵（強制ロック解除のアイテム課金）

### 実装済み（追加）

| 機能 | 説明 |
|---|---|
| アルバム共有 | 共有コード（UUID）を生成して他ユーザーにアルバムを共有。写真はロック状態で共有され、受信者も同じ場所へ再訪することでロック解除可能 |

---

## 画面構成

```
MainTabs
├── ホーム (HomeTab)
│   ├── NearbyScreen          — 近くの思い出マップ
│   └── UnlockCameraScreen    — ロック解除カメラ
├── カメラ (CameraTab)
│   └── CaptureScreen         — 撮影画面
├── 現像待ち (TmpTab)
│   ├── TmpAlbumScreen        — 直近 3 日間の未整理写真一覧
│   └── WriteMessageScreen    — メッセージ入力・アルバム保存
├── 机の上 (DeskTab)
│   └── DeskScreen            — メッセージ付き未整理写真の一覧・アルバムへ移動
├── アルバム (AlbumTab)
│   ├── AlbumListScreen       — 全アルバム一覧（本棚バッジ付き）
│   └── AlbumDetailScreen     — アルバム内写真一覧・メッセージ表示・追記
├── 本棚 (BookshelfTab)
│   ├── BookshelfScreen       — 本棚一覧・作成
│   ├── BookshelfDetailScreen — 本棚内アルバム一覧
│   └── AlbumDetailScreen     — アルバム内写真一覧・メッセージ表示・追記
└── 設定 (SettingsTab)
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
