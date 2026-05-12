import React, { createContext, useContext, useRef } from 'react'

type CameraContextType = {
  shootRef: React.MutableRefObject<(() => void) | null>
}

const CameraContext = createContext<CameraContextType>({
  shootRef: { current: null },
})

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const shootRef = useRef<(() => void) | null>(null)
  return (
    <CameraContext.Provider value={{ shootRef }}>
      {children}
    </CameraContext.Provider>
  )
}

export const useCameraContext = () => useContext(CameraContext)
