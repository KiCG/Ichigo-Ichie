import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STORAGE_MARKER = '/storage/v1/object/public/photos/'

serve(async (req) => {
  // pg_cron / ダッシュボードからの呼び出しのみ受け付ける
  const authHeader = req.headers.get('Authorization') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  )

  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // 削除対象の tmp 写真を取得
  const { data: photos, error: fetchError } = await supabase
    .from('photos')
    .select('id, image_url')
    .is('album_id', null)
    .lt('taken_at', cutoff)

  if (fetchError) {
    console.error('fetch error:', fetchError.message)
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!photos?.length) {
    return new Response(JSON.stringify({ deleted: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Storage ファイルを削除
  const storagePaths = photos
    .map(p => {
      const idx = p.image_url.indexOf(STORAGE_MARKER)
      return idx >= 0 ? p.image_url.substring(idx + STORAGE_MARKER.length) : null
    })
    .filter((p): p is string => p !== null)

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('photos')
      .remove(storagePaths)
    if (storageError) {
      console.error('storage delete error:', storageError.message)
    }
  }

  // DB レコードを削除（CASCADE で messages / unlock_records も削除される）
  const photoIds = photos.map(p => p.id)
  const { error: deleteError } = await supabase
    .from('photos')
    .delete()
    .in('id', photoIds)

  if (deleteError) {
    console.error('db delete error:', deleteError.message)
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`cleanup-tmp-photos: deleted ${photos.length} photos`)
  return new Response(
    JSON.stringify({ deleted: photos.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
