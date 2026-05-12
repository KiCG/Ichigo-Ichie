import { Dimensions } from 'react-native'

// iPhone 17e (390×844pt) を基準にスケール
const BASE_WIDTH = 390
const BASE_HEIGHT = 844

const { width, height } = Dimensions.get('window')

// 横幅基準のスケール（UI部品サイズ用）
export const scale = width / BASE_WIDTH

// 縦幅基準のスケール（余白・縦方向サイズ用）
export const vScale = height / BASE_HEIGHT

// 中間スケール（フォントサイズなど微調整が必要なもの用）
export const mScale = (size: number, factor = 0.5) =>
  size + (scale * size - size) * factor

// タブバーの高さ（CaptureScreen など他画面でFAB位置を参照するために共有）
export const TAB_BAR_HEIGHT = Math.round(110 * vScale)
export const FAB_SIZE = Math.round(90 * scale)
