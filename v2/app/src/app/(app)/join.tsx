import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { acceptInvite } from '@/lib/albums';
import { errorMessage } from '@/lib/memories';
import { colors, spacing } from '@/theme';

// 招待コードを入力して、アルバムに参加する
export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    if (!code.trim()) {
      setError('招待コードを入力してください。');
      return;
    }
    setError('');
    setJoining(true);
    try {
      const albumId = await acceptInvite(code);
      router.replace({ pathname: '/album/[id]', params: { id: albumId } });
    } catch (e) {
      setError(errorMessage(e));
      setJoining(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>友だちから届いた招待コード（8文字）を入力してください。</Text>
      <Field
        label="招待コード"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="例：K7QM3XPA"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={20}
        returnKeyType="done"
        onSubmitEditing={join}
        style={styles.codeInput}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="参加する" onPress={join} loading={joining} />
      <Text style={styles.note}>
        参加すると、そのアルバムの思い出の写真と場所が見えるようになります。メッセージを読むには、それぞれの場所へ行って解除する必要があります。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  text: { fontSize: 15, color: colors.text, lineHeight: 22 },
  codeInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
});
