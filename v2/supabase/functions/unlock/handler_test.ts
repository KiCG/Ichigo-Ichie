import { assertEquals } from "@std/assert";
import { createHandler, type Deps, distanceM, isNearby, PhotoLimitError } from "./handler.ts";
import { createGeminiJudge, parseJudgement } from "./gemini.ts";

const MEMORY_ID = "11111111-0000-0000-0000-000000000000";
const USER_ID = "bbbbbbbb-0000-0000-0000-000000000000";
// 京都・清水寺あたり
const HERE = { lat: 34.9949, lon: 135.785 };

type Calls = { recorded: number; saved: number; judged: number };

function fakeDeps(overrides: Partial<Deps> = {}): { deps: Deps; calls: Calls } {
  const calls: Calls = { recorded: 0, saved: 0, judged: 0 };
  const deps: Deps = {
    getUserId: (jwt) => Promise.resolve(jwt === "good-token" ? USER_ID : null),
    getVisibleMemory: (_jwt, id) =>
      Promise.resolve(
        id === MEMORY_ID
          ? { id, latitude: HERE.lat, longitude: HERE.lon, photo_path: "a/m.jpg" }
          : null,
      ),
    downloadPhoto: () => Promise.resolve(new Uint8Array([1])),
    judge: () => {
      calls.judged++;
      return Promise.resolve(true);
    },
    recordUnlock: () => {
      calls.recorded++;
      return Promise.resolve({ id: "u1", unlocked_at: "2026-11-22T00:00:00Z" });
    },
    saveVisitPhoto: () => {
      calls.saved++;
      return Promise.resolve("b/visits/u1.jpg");
    },
    ...overrides,
  };
  return { deps, calls };
}

function request(fields: Record<string, string> = {}, opts: { token?: string; photo?: File | null } = {}) {
  const form = new FormData();
  const base = {
    memory_id: MEMORY_ID,
    latitude: String(HERE.lat),
    longitude: String(HERE.lon),
    accuracy: "10",
    ...fields,
  };
  for (const [k, v] of Object.entries(base)) form.set(k, v);
  const photo = opts.photo === undefined
    ? new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "now.jpg", { type: "image/jpeg" })
    : opts.photo;
  if (photo) form.set("photo", photo);
  return new Request("http://localhost/unlock", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.token ?? "good-token"}` },
    body: form,
  });
}

// 北へ d メートル動かした緯度
const north = (d: number) => String(HERE.lat + d / 111_195);

Deno.test("距離の計算", () => {
  assertEquals(Math.round(distanceM(HERE.lat, HERE.lon, Number(north(100)), HERE.lon)), 100);
  assertEquals(isNearby(100, 0), true);
  assertEquals(isNearby(120, 30), true);
  assertEquals(isNearby(200, 1000), false); // 誤差は 50m までしか差し引かない
});

Deno.test("一致すれば解除を記録する", async () => {
  const { deps, calls } = fakeDeps();
  const res = await createHandler(deps)(request());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.matched, true);
  assertEquals(body.unlock_id, "u1");
  assertEquals(body.photo_saved, false);
  assertEquals(calls, { recorded: 1, saved: 0, judged: 1 });
});

Deno.test("save_photo なら訪問写真を保存する", async () => {
  const { deps, calls } = fakeDeps();
  const body = await (await createHandler(deps)(request({ save_photo: "true" }))).json();
  assertEquals(body.photo_saved, true);
  assertEquals(calls.saved, 1);
});

Deno.test("写真の上限を超えても解除は有効", async () => {
  const { deps, calls } = fakeDeps({ saveVisitPhoto: () => Promise.reject(new PhotoLimitError()) });
  const body = await (await createHandler(deps)(request({ save_photo: "true" }))).json();
  assertEquals(body.matched, true);
  assertEquals(body.photo_saved, false);
  assertEquals(body.photo_error, "photo_limit");
  assertEquals(calls.recorded, 1);
});

Deno.test("遠すぎると AI 判定をせずに断る", async () => {
  const { deps, calls } = fakeDeps();
  const body = await (await createHandler(deps)(request({ latitude: north(300) }))).json();
  assertEquals(body, { matched: false, reason: "too_far", distance_m: 300 });
  assertEquals(calls, { recorded: 0, saved: 0, judged: 0 });
});

Deno.test("GPS の誤差を考慮する", async () => {
  const { deps } = fakeDeps();
  const body = await (await createHandler(deps)(request({ latitude: north(130), accuracy: "40" }))).json();
  assertEquals(body.matched, true);
});

Deno.test("一致しなければ記録しない", async () => {
  const { deps, calls } = fakeDeps({ judge: () => Promise.resolve(false) });
  const body = await (await createHandler(deps)(request())).json();
  assertEquals(body, { matched: false, reason: "not_matched" });
  assertEquals(calls.recorded, 0);
});

Deno.test("AI 判定が失敗したら記録しない", async () => {
  const { deps, calls } = fakeDeps({ judge: () => Promise.reject(new Error("boom")) });
  const res = await createHandler(deps)(request());
  assertEquals(res.status, 502);
  assertEquals(calls.recorded, 0);
});

Deno.test("見えない思い出は 404", async () => {
  const { deps } = fakeDeps();
  const res = await createHandler(deps)(request({ memory_id: "22222222-0000-0000-0000-000000000000" }));
  assertEquals(res.status, 404);
});

Deno.test("種類が付いていなくても中身が JPEG なら受け付ける", async () => {
  const { deps } = fakeDeps();
  const noType = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "blob");
  const body = await (await createHandler(deps)(request({}, { photo: noType }))).json();
  assertEquals(body.matched, true);
});

Deno.test("ログインしていなければ 401", async () => {
  const { deps } = fakeDeps();
  assertEquals((await createHandler(deps)(request({}, { token: "bad" }))).status, 401);
});

Deno.test("入力が不正なら 400", async () => {
  const { deps, calls } = fakeDeps();
  const h = createHandler(deps);
  assertEquals((await h(request({ memory_id: "x" }))).status, 400);
  assertEquals((await h(request({ latitude: "abc" }))).status, 400);
  assertEquals((await h(request({}, { photo: null }))).status, 400);
  const png = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
  assertEquals((await h(request({}, { photo: png }))).status, 400);
  const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.jpg", { type: "image/jpeg" });
  assertEquals((await h(request({}, { photo: big }))).status, 400);
  assertEquals(calls.judged, 0);
});

Deno.test("Gemini の応答を読む", () => {
  const wrap = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
  assertEquals(parseJudgement(wrap('{"matched": true}')), true);
  assertEquals(parseJudgement(wrap('{"matched": false}')), false);
  let threw = false;
  try {
    parseJudgement(wrap('{"other": 1}'));
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("Gemini には元の写真、今の写真の順で送り、キーはヘッダーで渡す", async () => {
  let sent: { url: string; init: RequestInit } | null = null;
  const fakeFetch = ((url: string, init: RequestInit) => {
    sent = { url, init };
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"matched":true}' }] } }] })),
    );
  }) as unknown as typeof fetch;
  const judge = createGeminiJudge("KEY", "gemini-2.5-flash", fakeFetch);
  assertEquals(await judge(new Uint8Array([1]), new Uint8Array([2])), true);
  const s = sent as unknown as { url: string; init: RequestInit };
  assertEquals(s.url.includes("KEY"), false);
  assertEquals((s.init.headers as Record<string, string>)["x-goog-api-key"], "KEY");
  const parts = JSON.parse(String(s.init.body)).contents[0].parts;
  assertEquals(parts[1].inline_data.data, "AQ=="); // [1]
  assertEquals(parts[2].inline_data.data, "Ag=="); // [2]
});
