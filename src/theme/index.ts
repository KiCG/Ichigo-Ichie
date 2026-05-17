import { Platform } from 'react-native'

// --- Colors ---
export const COLORS = {
  paper: '#FBF7F0',        // ベース（紙）
  paperDeep: '#F5F1E8',    // 凹み（セクション・入力）
  paperEdge: '#EFE9DC',    // hover / 押下時
  ink: '#2C2620',          // 本文・見出し（黒は使わない）
  inkSub: '#6B5F50',       // 副情報
  inkSoft: '#8A7F70',      // プレースホルダ・メタ
  rule: '#E8DFD0',         // 罫線
  accent: '#3A4A5C',       // 藍（CTA・選択）
  seal: '#8B3A3A',         // 朱（しおり・強調1点）
  danger: '#A0522D',
  white: '#FFFFFF',
} as const

// --- Font families ---
export const FONTS = {
  serif: Platform.select({
    ios: 'Hiragino Mincho ProN',
    android: 'serif',
    default: 'serif',
  }) as string,
  sans: Platform.select({
    ios: 'Hiragino Sans',
    android: 'sans-serif',
    default: 'sans-serif',
  }) as string,
}

// --- Typography presets ---
export const TYPE = {
  display: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    fontWeight: '400' as const,
    color: COLORS.ink,
    letterSpacing: 1,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '400' as const,
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  date: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: '400' as const,
    color: COLORS.ink,
  },
  dateSmall: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    fontWeight: '400' as const,
    color: COLORS.inkSub,
  },
  heading: {
    fontFamily: FONTS.sans,
    fontSize: 17,
    fontWeight: '600' as const,
    color: COLORS.ink,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '400' as const,
    color: COLORS.ink,
    lineHeight: 26,
  },
  bodySerif: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    fontWeight: '400' as const,
    color: COLORS.ink,
    lineHeight: 28,
  },
  caption: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400' as const,
    color: COLORS.inkSub,
    lineHeight: 20,
  },
  meta: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '400' as const,
    color: COLORS.inkSoft,
    letterSpacing: 0.8,
  },
}

// --- Spacing scale (8-based) ---
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
}

// --- Border radius (minimal, paper-like) ---
export const RADIUS = {
  none: 0,
  thumb: 4,    // 写真サムネ
  card: 2,     // カード（ほぼ角あり）
}
