// Gemini で2枚の写真が同じ場所かを判定する
import { encodeBase64 } from "@std/encoding/base64";

const PROMPT =
  "2枚の写真を比較してください。1枚目は過去に撮影した写真、2枚目は今撮影した写真です。" +
  "昼夜の違い、季節の違い、天気の違い、年月による変化、手前の人物や障害物の違い、構図や画角の違いは無視し、" +
  "建物や風景のロケーション（背景）が同じ場所かどうかだけを判定してください。" +
  "判定はおおまかで構いません。同じ場所である可能性が十分にあれば matched を true にしてください。";

export function createGeminiJudge(apiKey: string, model: string, fetchFn: typeof fetch = fetch) {
  return async (original: Uint8Array, current: Uint8Array): Promise<boolean> => {
    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: "image/jpeg", data: encodeBase64(original) } },
              { inline_data: { mime_type: "image/jpeg", data: encodeBase64(current) } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { matched: { type: "BOOLEAN" } },
              required: ["matched"],
            },
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    return parseJudgement(await res.json());
  };
}

// Gemini の応答から判定結果を取り出す。読めなければ例外
export function parseJudgement(data: unknown): boolean {
  // deno-lint-ignore no-explicit-any
  const text = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini response has no text");
  const parsed = JSON.parse(text);
  if (typeof parsed?.matched !== "boolean") throw new Error("Gemini response has no matched");
  return parsed.matched;
}
