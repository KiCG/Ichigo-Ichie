import React from 'react'
import { useRoute, RouteProp } from '@react-navigation/native'
import AlbumDetailView from '../../components/AlbumDetailView'
import type { AlbumStackParamList } from '../../types'

type AlbumDetailRoute = RouteProp<AlbumStackParamList, 'AlbumDetail'>

export default function AlbumDetailScreen() {
  const route = useRoute<AlbumDetailRoute>()
  return <AlbumDetailView albumId={route.params.albumId} />
}
