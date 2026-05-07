import { createClient } from '@supabase/supabase-js'

const memoryStorage: Record<string, string> = {}

const inMemoryAdapter = {
  getItem: (key: string): string | null => memoryStorage[key] ?? null,
  setItem: (key: string, value: string): void => { memoryStorage[key] = value },
  removeItem: (key: string): void => { delete memoryStorage[key] },
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: inMemoryAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
