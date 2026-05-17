// --- DB Types ---

export type PlanType = 'free' | 'premium' | 'pro'
export type Permission = 'read_only' | 'can_edit'

export interface User {
  id: string
  name: string
  plan_type: PlanType
  created_at: string
}

export interface Bookshelf {
  id: string
  user_id: string
  title: string
  created_at: string
}

export interface Album {
  id: string
  bookshelf_id: string | null
  user_id: string
  title: string
  cover_photo_id: string | null
  is_desk: boolean
  created_at: string
}

export interface Photo {
  id: string
  album_id: string
  user_id: string
  image_url: string
  latitude: number
  longitude: number
  taken_at: string
}

export interface Message {
  id: string
  photo_id: string
  content: string
  author_id: string
  is_original: boolean
  created_at: string
}

export interface UnlockRecord {
  id: string
  user_id: string
  photo_id: string
  unlock_image_url: string | null
  unlocked_at: string
}

export interface AlbumShare {
  id: string
  album_id: string
  shared_by_user_id: string
  shared_to_user_id: string | null
  share_token: string | null
  permission: Permission
  shared_at: string
}

// --- Navigation Types ---

export type AuthStackParamList = {
  Login: undefined
  Signup: undefined
}

export type HomeStackParamList = {
  Nearby: undefined
  UnlockCamera: { photoId: string }
}

export type CameraStackParamList = {
  Capture: undefined
  WriteMessage: { photoId: string; imageUrl: string }
}

export type MemoriesStackParamList = {
  Memories: undefined
  TmpAll: undefined
  Desk: { initialPhotoId?: string } | undefined
  AlbumList: undefined
  AlbumDetail: { albumId: string; albumTitle: string }
  Bookshelf: undefined
  BookshelfDetail: { bookshelfId: string; bookshelfTitle: string }
  WriteMessage: { photoId: string; imageUrl: string }
}

export type MainTabParamList = {
  HomeTab: undefined
  MemoriesTab: undefined
  CameraTab: undefined
  SettingsTab: undefined
}
