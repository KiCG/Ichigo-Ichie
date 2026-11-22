import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { createAlbum, renameAlbum } from '@/lib/albums';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/memories';
import { spacing } from '@/theme';

// アルバムを作る（id があれば名前を変える）
export default function AlbumFormScreen() {
  const { id, name: currentName } = useLocalSearchParams<{ id?: string; name?: string }>();
  const { session } = useAuth();
  const [name, setName] = useState(currentName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isRename = !!id;

  async function save() {
    if (!session) return;
    if (!name.trim()) {
      setError('アルバムの名前を入れてください。');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (isRename) {
        await renameAlbum(id, name);
        router.back();
      } else {
        const newId = await createAlbum(session.user.id, name);
        router.replace({ pathname: '/album/[id]', params: { id: newId } });
      }
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isRename ? 'アルバムの名前を変える' : '新しいアルバム' }} />
      <Field
        label="アルバムの名前"
        value={name}
        onChangeText={setName}
        placeholder="例：京都の旅、ふたりの散歩道"
        maxLength={100}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={isRename ? '変更する' : '作る'} onPress={save} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
});
