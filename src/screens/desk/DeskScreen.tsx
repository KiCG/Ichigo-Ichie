import React, { useState, useCallback } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import AlbumDetailView from '../../components/AlbumDetailView'

export default function DeskScreen() {
  const [deskAlbumId, setDeskAlbumId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      let active = true
      const fetch = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !active) return
        const { data } = await supabase
          .from('albums')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_desk', true)
          .single()
        if (active) {
          setDeskAlbumId(data?.id ?? null)
          setLoading(false)
        }
      }
      fetch()
      return () => { active = false }
    }, [])
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8B7355" />
      </View>
    )
  }

  if (!deskAlbumId) return null

  return (
    <AlbumDetailView
      albumId={deskAlbumId}
      emptyText="机の上には何も置かれていません"
      showMoveAction
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
