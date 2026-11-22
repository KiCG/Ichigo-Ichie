import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY が設定されていません。' +
      '.env.example を .env.local にコピーしてください。',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // ログイン状態を端末に保存し、アプリを閉じてもログインしたままにする
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// アプリが前面にあるときだけ、ログインの更新を行う
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
