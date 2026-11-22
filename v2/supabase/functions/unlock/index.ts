// 解除用の Edge Function
//
// 送り方: POST multipart/form-data（Authorization: Bearer <利用者のアクセストークン>）
//   memory_id   解除したい思い出の ID
//   latitude    現在地の緯度
//   longitude   現在地の経度
//   accuracy    GPS の誤差（メートル、任意）
//   save_photo  "true" なら訪問写真として保存する
//   photo       今撮った写真（JPEG、5MB まで）
//
// 返り値（JSON）
//   { matched: true, unlock_id, unlocked_at, photo_saved, photo_error? }
//   { matched: false, reason: "too_far", distance_m } / { matched: false, reason: "not_matched" }
//   エラー: 400 bad_request / 401 unauthorized / 404 not_found / 502 judge_failed
import { createClient } from "@supabase/supabase-js";
import { createHandler, PhotoLimitError } from "./handler.ts";
import { createGeminiJudge } from "./gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const BUCKET = "photos";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createHandler({
  async getUserId(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    return error ? null : data.user?.id ?? null;
  },

  async getVisibleMemory(jwt, memoryId) {
    // 利用者の権限で読むので、アクセスルール（見えるかどうか）がそのまま効く
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await asUser
      .from("memories")
      .select("id, latitude, longitude, photo_path")
      .eq("id", memoryId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async downloadPhoto(path) {
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  },

  judge: (original, current) => {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    return createGeminiJudge(GEMINI_API_KEY, GEMINI_MODEL)(original, current);
  },

  async recordUnlock(memoryId, userId) {
    const { data, error } = await admin
      .from("unlocks")
      .insert({ memory_id: memoryId, user_id: userId })
      .select("id, unlocked_at")
      .single();
    if (error) throw error;
    return data;
  },

  async saveVisitPhoto(userId, unlockId, photo) {
    const path = `${userId}/visits/${unlockId}.jpg`;
    const up = await admin.storage.from(BUCKET).upload(path, photo, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    // 写真の上限はトリガーで確認される
    const { error } = await admin.from("unlocks").update({ photo_path: path }).eq("id", unlockId);
    if (error) {
      await admin.storage.from(BUCKET).remove([path]);
      if (error.message.includes("photo limit reached")) throw new PhotoLimitError();
      throw error;
    }
    return path;
  },
});

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    console.error("unlock failed:", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
