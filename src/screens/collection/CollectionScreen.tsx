import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import TmpAlbumScreen from '../tmp/TmpAlbumScreen'
import DeskScreen from '../desk/DeskScreen'
import AlbumListScreen from '../album/AlbumListScreen'
import BookshelfScreen from '../album/BookshelfScreen'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { CollectionStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  activeBg: '#F5EFE6',
}

const TABS = ['現像待ち', '机の上', 'アルバム', '本棚'] as const

type Props = {
  navigation: NativeStackNavigationProp<CollectionStackParamList, 'CollectionHome'>
}

export default function CollectionScreen({ navigation }: Props) {
  const [activeTab, setActiveTab] = useState(0)

  const renderContent = () => {
    switch (activeTab) {
      case 0: return <TmpAlbumScreen />
      case 1: return <DeskScreen />
      case 2: return <AlbumListScreen navigation={navigation} />
      case 3: return <BookshelfScreen navigation={navigation} />
      default: return null
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.tabRow}>
          {TABS.map((label, index) => {
            const active = activeTab === index
            return (
              <TouchableOpacity
                key={label}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(index)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {label}
                </Text>
                {active && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            )
          })}
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: COLORS.activeBg,
    borderRadius: 6,
  },
  tabLabel: {
    fontSize: 12,
    color: COLORS.subtext,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 20,
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },
  content: { flex: 1 },
})
