import { supabase } from './supabase'

export async function deletePhoto(photoId: string, imageUrl: string): Promise<void> {
  // Delete dependent records before the photo row to avoid FK constraint violations
  await supabase.from('unlock_records').delete().eq('photo_id', photoId)
  await supabase.from('messages').delete().eq('photo_id', photoId)

  const { error } = await supabase.from('photos').delete().eq('id', photoId)
  if (error) throw error

  // Storage cleanup — best effort, a dangling file is acceptable
  const marker = '/storage/v1/object/public/photos/'
  const idx = imageUrl.indexOf(marker)
  if (idx >= 0) {
    const storagePath = imageUrl.substring(idx + marker.length)
    await supabase.storage.from('photos').remove([storagePath])
  }
}
