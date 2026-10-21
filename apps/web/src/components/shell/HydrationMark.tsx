'use client'

import { useEffect } from 'react'

// 페이지 전체가 하이드레이션을 마치면 body에 표시를 단다(E2E waitHydrated가 모든 화면에서 기다린다).
// 앱에 Suspense·loading 경계가 없어 루트 효과는 화면 전체 하이드레이션 뒤에 돈다
export function HydrationMark() {
  useEffect(() => {
    document.body.dataset.hydrated = ''
  }, [])
  return null
}
