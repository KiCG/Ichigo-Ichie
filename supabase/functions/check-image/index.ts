import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { originalImageUrl, newImageUrl } = await req.json()

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not set')

    const [originalRes, newRes] = await Promise.all([
      fetch(originalImageUrl),
      fetch(newImageUrl),
    ])

    if (!originalRes.ok) throw new Error(`original image fetch failed: ${originalRes.status}`)
    if (!newRes.ok) throw new Error(`new image fetch failed: ${newRes.status}`)

    const [originalBuf, newBuf] = await Promise.all([
      originalRes.arrayBuffer(),
      newRes.arrayBuffer(),
    ])

    const originalBase64 = encode(originalBuf)
    const newBase64 = encode(newBuf)

    const prompt =
      '以下の2枚の画像を比較してください。昼夜の違い、季節の違い、手前の人物や障害物の違いは完全に無視し、' +
      '建物や風景のロケーション（背景）が同一であるかのみを判定してください。' +
      '同一の場所であれば true、異なる場所であれば false のみを返してください。' +
      '少し優しめに判定してください(同じ可能性があればtrueを返す)'

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: originalBase64 } },
              { inline_data: { mime_type: 'image/jpeg', data: newBase64 } },
            ],
          }],
        }),
      }
    )

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text()
      throw new Error(`Gemini API error ${geminiRes.status}: ${errBody}`)
    }

    const data = await geminiRes.json()
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase()
    const matched = result === 'true'

    return new Response(
      JSON.stringify({ matched }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('check-image error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
