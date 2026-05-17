import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // JST での「今日」の範囲（UTC で -9h 分ずらして比較）
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayStart = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()) - 9 * 60 * 60 * 1000)
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const { data: photos, error: fetchError } = await supabase
    .from('photos')
    .select('id, user_id, album_id, notify_shared')
    .gte('unlock_at', todayStart.toISOString())
    .lt('unlock_at',  todayEnd.toISOString())
    .not('album_id', 'is', null)

  if (fetchError) {
    console.error('fetch error:', fetchError.message)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  if (!photos?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 共有先にも通知する設定の写真だけを対象に、共有レコードを取得
  const shareEligibleAlbumIds = Array.from(
    new Set(
      photos
        .filter(p => p.notify_shared && p.album_id)
        .map(p => p.album_id as string)
    )
  )
  const albumToRecipients: Record<string, string[]> = {}
  if (shareEligibleAlbumIds.length > 0) {
    const { data: shares } = await supabase
      .from('album_shares')
      .select('album_id, shared_to_user_id')
      .in('album_id', shareEligibleAlbumIds)
      .not('shared_to_user_id', 'is', null)
    for (const s of shares ?? []) {
      if (!s.shared_to_user_id) continue
      if (!albumToRecipients[s.album_id]) albumToRecipients[s.album_id] = []
      albumToRecipients[s.album_id].push(s.shared_to_user_id)
    }
  }

  // ユーザーごとに写真IDをまとめる（所有者 + オプトイン時のみ共有先、重複は排除）
  const userPhotos: Record<string, Set<string>> = {}
  const addPhoto = (userId: string, photoId: string) => {
    if (!userPhotos[userId]) userPhotos[userId] = new Set()
    userPhotos[userId].add(photoId)
  }
  for (const p of photos) {
    addPhoto(p.user_id, p.id)
    if (!p.notify_shared || !p.album_id) continue
    for (const recipientId of albumToRecipients[p.album_id] ?? []) {
      if (recipientId !== p.user_id) addPhoto(recipientId, p.id)
    }
  }

  const userIds = Object.keys(userPhotos)

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
    const ids = Array.from(userPhotos[u.id] ?? new Set<string>())
    const count = ids.length
    return {
      to: u.push_token,
      title: '一期一会',
      body: count === 1
        ? 'タイムカプセルを開封できます。現地へ向かいましょう。'
        : `${count}件のタイムカプセルを開封できます。現地へ向かいましょう。`,
      data: { screen: 'Memories', photoId: ids[0] },
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

  console.log(`send-scheduled-notifications: sent to ${users.length} users`)
  return new Response(JSON.stringify({ sent: users.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
