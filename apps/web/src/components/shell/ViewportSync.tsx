'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LANDSCAPE_PHONE_QUERY, NARROW_QUERY, shouldRefresh, viewportDevice } from '@/server/device'
import type { Device } from '@/server/device'
import { saveViewportAction } from '@/server/auth/viewport-actions'

// 셸이 바뀌면 이 컴포넌트도 다시 마운트되므로 모듈 범위에 둔다
let refreshedFrom: Device | null = null

// 3-12: 서버는 user-agent로 화면을 고른다. 실제 화면과 다르면(좁힌 데스크톱 창, 가로 태블릿 등)
// 세션에 보정값을 저장하고 다시 받는다 — 고르지 않은 서버 트리는 클라이언트에 없어서 혼자 바꿀 수 없다.
// 로그인 전에는 저장할 세션이 없어 user-agent대로 둔다(3-13 6단계에서 duty_vp 쿠키를 없앴다)
export function ViewportSync({ device }: { device: Device }) {
  const router = useRouter()
  useEffect(() => {
    const narrow = window.matchMedia(NARROW_QUERY)
    const landscapePhone = window.matchMedia(LANDSCAPE_PHONE_QUERY)
    const sync = () => {
      const want = viewportDevice({ narrow: narrow.matches, landscapePhone: landscapePhone.matches })
      if (shouldRefresh({ want, device, refreshedFrom })) {
        refreshedFrom = device
        void saveViewportAction(want).finally(() => router.refresh())
      }
    }
    sync()
    narrow.addEventListener('change', sync)
    landscapePhone.addEventListener('change', sync)
    return () => {
      narrow.removeEventListener('change', sync)
      landscapePhone.removeEventListener('change', sync)
    }
  }, [device, router])
  return null
}
