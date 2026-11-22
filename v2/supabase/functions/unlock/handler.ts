// 解除の処理の流れ（外部とのやり取りは Deps として受け取る。テストでは偽物に差し替える）

export const RADIUS_M = 100; // 撮影地点からこの距離以内なら解除できる
export const MAX_ACCURACY_M = 50; // GPS の誤差として差し引く上限
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type Memory = {
  id: string;
  latitude: number;
  longitude: number;
  photo_path: string;
};

export type Deps = {
  // アクセストークンから利用者 ID を得る（無効なら null）
  getUserId(jwt: string): Promise<string | null>;
  // 利用者の権限で思い出を読む（見えなければ null）
  getVisibleMemory(jwt: string, memoryId: string): Promise<Memory | null>;
  downloadPhoto(path: string): Promise<Uint8Array>;
  // 2枚の写真が同じ場所か
  judge(original: Uint8Array, current: Uint8Array): Promise<boolean>;
  // 解除を記録する（service role）
  recordUnlock(memoryId: string, userId: string): Promise<{ id: string; unlocked_at: string }>;
  // 訪問写真を保存して解除記録に結びつける。上限を超えたら "photo_limit" を投げる
  saveVisitPhoto(userId: string, unlockId: string, photo: Uint8Array): Promise<string>;
};

export class PhotoLimitError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 2点間の距離（メートル）
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// GPS の誤差を考慮して、撮影地点の近くにいるか
export function isNearby(distance: number, accuracy: number): boolean {
  const slack = Math.min(Math.max(accuracy, 0), MAX_ACCURACY_M);
  return distance - slack <= RADIUS_M;
}

type Input = {
  memoryId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  savePhoto: boolean;
  photo: Uint8Array;
};

async function parseInput(req: Request): Promise<Input | string> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return "multipart/form-data で送ってください";
  }
  const memoryId = String(form.get("memory_id") ?? "");
  if (!UUID.test(memoryId)) return "memory_id が不正です";

  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  const accuracy = Number(form.get("accuracy") ?? 0);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return "latitude が不正です";
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "longitude が不正です";
  if (!Number.isFinite(accuracy)) return "accuracy が不正です";

  const file = form.get("photo");
  if (!(file instanceof File)) return "photo がありません";
  if (file.type !== "image/jpeg") return "photo は JPEG にしてください";
  if (file.size > MAX_PHOTO_BYTES) return "photo が大きすぎます（5MB まで）";

  return {
    memoryId,
    latitude,
    longitude,
    accuracy,
    savePhoto: form.get("save_photo") === "true",
    photo: new Uint8Array(await file.arrayBuffer()),
  };
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    // 1. 利用者の確認
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const userId = jwt ? await deps.getUserId(jwt) : null;
    if (!userId) return json(401, { error: "unauthorized" });

    // 2. 入力の確認
    const input = await parseInput(req);
    if (typeof input === "string") return json(400, { error: "bad_request", message: input });

    // 3. その思い出が見えるか（利用者の権限で読む）
    const memory = await deps.getVisibleMemory(jwt, input.memoryId);
    if (!memory) return json(404, { error: "not_found" });

    // 4. 位置の確認
    const distance = distanceM(input.latitude, input.longitude, memory.latitude, memory.longitude);
    if (!isNearby(distance, input.accuracy)) {
      return json(200, { matched: false, reason: "too_far", distance_m: Math.round(distance) });
    }

    // 5. AI 判定（常に元の写真と比べる）
    let matched: boolean;
    try {
      const original = await deps.downloadPhoto(memory.photo_path);
      matched = await deps.judge(original, input.photo);
    } catch (e) {
      console.error("judge failed:", e);
      return json(502, { error: "judge_failed" });
    }
    if (!matched) return json(200, { matched: false, reason: "not_matched" });

    // 6. 解除を記録
    const unlock = await deps.recordUnlock(memory.id, userId);

    // 7. 訪問写真の保存（任意）。失敗しても解除は有効
    let photoSaved = false;
    let photoError: string | undefined;
    if (input.savePhoto) {
      try {
        await deps.saveVisitPhoto(userId, unlock.id, input.photo);
        photoSaved = true;
      } catch (e) {
        photoError = e instanceof PhotoLimitError ? "photo_limit" : "save_failed";
        if (photoError === "save_failed") console.error("save visit photo failed:", e);
      }
    }

    return json(200, {
      matched: true,
      unlock_id: unlock.id,
      unlocked_at: unlock.unlocked_at,
      photo_saved: photoSaved,
      ...(photoError ? { photo_error: photoError } : {}),
    });
  };
}
