import React from 'react'
import { useRoute, RouteProp } from '@react-navigation/native'
import AlbumDetailView from '../../components/AlbumDetailView'

type AlbumDetailRoute = RouteProp<{ AlbumDetail: { albumId: string; albumTitle: string } }, 'AlbumDetail'>

export default function AlbumDetailScreen() {
  const route = useRoute<AlbumDetailRoute>()
  return <AlbumDetailView albumId={route.params.albumId} showMoveAction />
}
