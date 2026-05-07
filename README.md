# 一期一会 (Ichigo-Ichie)

> 「その時、その場所で、何を思った？」

過去に写真を撮った同じ場所へ再び訪れ、同じ風景をカメラで捉えたときだけ、過去の自分が残したメッセージのロックが解除される思い出記録アプリ。

---

## 概要

写真に紐付けた日記メッセージは、撮影地点の半径 50m 以内で再撮影し、AI が同じロケーションと判定するまで読めない。「不便を楽しむ」ことで再訪の動機と再会の感動を生み出す。

---

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| フロントエンド | React Native (Expo SDK 54) + TypeScript |
| バックエンド / DB | Supabase (PostgreSQL, Auth, Storage) |
| 画像認識 AI | Google Gemini 2.5 Flash (Supabase Edge Functions 経由) |
| 位置情報 | expo-location |
| カメラ | expo-camera |
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

1. Supabase ダッシュボードの SQL Editor で `supabase/migrations/001_initial.sql` を実行
2. Storage に `photos` バケットを作成し **Public** に設定
3. Storage RLS ポリシーを追加：

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
# Supabase CLI でログイン・リンク
supabase login
supabase link --project-ref <your-project-ref>

# Gemini API キーを設定
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>

# デプロイ
supabase functions deploy check-image
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
| メッセージ保存 | 写真にメッセージを添えてアルバムへ保存 |
| tmp アルバム | 直近 3 日間の写真を一覧表示（残り日数バッジ付き）|
| 近くの思い出マップ | 現在地から半径 5km 以内の思い出を地図上にピン表示 |
| ロック解除 | GPS 50m 以内で再撮影 → AI 判定 → メッセージ開示 |
| アルバム閲覧 | アルバム一覧（カバー写真・枚数）→ 写真グリッド → メッセージ表示 |
| 設定 | カメラロール保存方式の選択・ログアウト |

### 未実装（今後の予定）

- tmp 写真の 3 日後自動削除（Supabase cron ジョブ）
- アルバム共有機能
- 本棚機能（アルバムのグループ化）
- ロック解除後のメッセージ追記
- プッシュ通知（削除 24 時間前の警告）
- フリーミアム制限の適用（写真枚数・アルバム数上限）
- 魔法の鍵（強制ロック解除のアイテム課金）

---

## 画面構成

```
MainTabs
├── ホーム (HomeTab)
│   ├── NearbyScreen        — 近くの思い出マップ
│   └── UnlockCameraScreen  — ロック解除カメラ
├── カメラ (CameraTab)
│   ├── CaptureScreen       — 撮影画面
│   └── WriteMessageScreen  — メッセージ入力・アルバム保存
├── tmp (TmpTab)
│   ├── TmpAlbumScreen      — 直近 3 日間の写真一覧
│   └── WriteMessageScreen  — メッセージ入力・アルバム保存
├── アルバム (AlbumTab)
│   ├── BookshelfScreen     — アルバム一覧
│   └── AlbumDetailScreen   — アルバム内写真一覧
└── 設定 (SettingsTab)
    └── SettingsScreen      — カメラロール設定・ログアウト
```

---

## データベース設計

| テーブル | 役割 |
|---|---|
| `users` | ユーザー情報（auth.users と同期）|
| `bookshelves` | アルバムをまとめる本棚 |
| `albums` | 写真のグループ |
| `photos` | 写真 URL・GPS 座標・撮影日時 |
| `messages` | 写真に紐付くメッセージ（追記も格納）|
| `unlock_records` | ロック解除済み記録 |
| `album_shares` | アルバムの共有設定 |

---

## ロック解除フロー

```
ユーザーが地図でピンをタップ
        ↓
GPS チェック（現在地 ≦ 50m 以内？）
        ↓ Yes
カメラ起動（右上に元写真のサムネイルを表示）
        ↓ 撮影
unlock 写真を Storage にアップロード
        ↓
Supabase Edge Function (check-image) 呼び出し
        ↓
Gemini 2.5 Flash が背景・ロケーションを比較
        ↓ matched: true
unlock_records に記録 → メッセージを表示
```

---

## カメラロール保存設定

設定画面から以下の 3 択を選択可能（デフォルト: すべて保存）：

| 設定値 | 動作 |
|---|---|
| すべての写真を保存 | 撮影直後にカメラロールへ保存 |
| メッセージ付きのみ保存 | メッセージを保存したタイミングでカメラロールへ保存 |
| 保存しない | カメラロールへは保存しない |
