declare module 'react-native-qrcode-svg' {
  import React from 'react'
  interface QRCodeProps {
    value: string
    size?: number
    color?: string
    backgroundColor?: string
    quietZone?: number
    enableLinearGradient?: boolean
    linearGradient?: string[]
    gradientDirection?: string[]
  }
  const QRCode: React.FC<QRCodeProps>
  export default QRCode
}
