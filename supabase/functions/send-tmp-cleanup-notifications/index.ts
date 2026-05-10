import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const now = Date.now()
  const cutoff48h = new Date(now - 48 * 60 * 60 * 1000).toISOString()
  const cutoff72h = new Date(now - 72 * 60 * 60 * 1000).toISOString()

  // 48〜72時間前に撮影されたtmp写真（削除まで0〜24時間）
  const { data: photos, error: fetchError } = await supabase
    .from('photos')
    .select('user_id')
    .is('album_id', null)
    .lt('taken_at', cutoff48h)
    .gte('taken_at', cutoff72h)

  if (fetchError) {
    console.error('fetch error:', fetchError.message)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  if (!photos?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ユーザーごとの件数を集計
  const userCounts: Record<string, number> = {}
  for (const row of photos) {
    userCounts[row.user_id] = (userCounts[row.user_id] ?? 0) + 1
  }

  const userIds = Object.keys(userCounts)

  // push_token を取得
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, push_token')
    .in('id', userIds)
    .not('push_token', 'is', null)

  if (userError || !users?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const messages = users.map(u => {
    const count = userCounts[u.id] ?? 1
    return {
      to: u.push_token,
      title: '一期一会',
      body: count === 1
        ? 'tmpアルバムの写真が明日削除されます。メッセージを書きますか？'
        : `tmpアルバムの${count}枚の写真が明日削除されます。`,
      data: { screen: 'TmpAlbum' },
    }
  })

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(messages),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Expo push error:', text)
    return new Response(JSON.stringify({ error: text }), { status: 500 })
  }

  console.log(`send-tmp-cleanup-notifications: sent to ${users.length} users`)
  return new Response(JSON.stringify({ sent: users.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
