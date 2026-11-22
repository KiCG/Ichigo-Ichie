# 一期一会 v2 アプリ

作り直し中の新しいアプリ（Expo SDK 58 / Expo Router）。設計は `docs/redesign.md` と `docs/data-model.md`。

## 動かし方

前提：Node.js 22 以上、iPhone に Expo Go（App Store の最新版）。

```bash
cd v2/app
npm install
cp .env.example .env.local   # 接続先（東京の Supabase プロジェクト）
npx expo start
```

表示された QR コードを iPhone のカメラで読むと、Expo Go で開きます。

- パソコンと iPhone は同じ Wi-Fi につなぐ
- つながらないときは `npx expo start --tunnel`

## 開発用コマンド

```bash
npx tsc --noEmit   # 型チェック
npx expo lint      # リント
npx expo install <package>   # パッケージの追加（SDK に合う版を選んでくれる）
```

## 構成

| 場所 | 中身 |
|---|---|
| `src/app/` | 画面（ファイルの置き場所がそのまま画面の構成になる） |
| `src/app/sign-in.tsx` | ログイン・新規登録 |
| `src/app/(app)/` | ログイン後の画面 |
| `src/lib/supabase.ts` | Supabase への接続 |
| `src/lib/auth.tsx` | ログイン状態の管理 |
| `src/components/` | 共通の部品 |
| `src/theme.ts` | 色と余白（デザインを差し替えるときはここ） |
