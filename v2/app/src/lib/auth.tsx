import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  // 端末に保存されたログイン状態を読み込み中
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, loading: false });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // ログインしたら、端末のタイムゾーンをプロフィールに保存する
  // （「封をした翌日以降に読める」の日付の区切りに使う）
  const userId = state.session?.user.id;
  useEffect(() => {
    if (!userId) return;
    syncTimezone(userId);
  }, [userId]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

async function syncTimezone(userId: string) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timezone) return;
  const { error } = await supabase
    .from('profiles')
    .update({ timezone })
    .eq('id', userId)
    .neq('timezone', timezone);
  if (error) console.warn('タイムゾーンを保存できませんでした:', error.message);
}

// Supabase のエラーを、利用者向けの日本語にする
export function authErrorMessage(message: string): string {
  if (message.includes('Invalid login credentials')) return 'メールアドレスかパスワードが違います。';
  if (message.includes('User already registered')) return 'このメールアドレスは登録済みです。';
  if (message.includes('Email not confirmed')) return '確認メールのリンクを開いてから、ログインしてください。';
  if (message.includes('Password should be at least')) return 'パスワードは6文字以上にしてください。';
  if (message.includes('Unable to validate email address')) return 'メールアドレスの形式が正しくありません。';
  if (message.includes('rate limit')) return '短時間に試しすぎました。しばらく待ってから試してください。';
  return `エラーが起きました：${message}`;
}
