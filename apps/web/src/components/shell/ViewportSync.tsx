'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  LANDSCAPE_PHONE_QUERY,
  NARROW_QUERY,
  VIEWPORT_COOKIE,
  shouldRefresh,
  viewportDevice,
} from '@/server/device'
import type { Device } from '@/server/device'

// 셸이 바뀌면 이 컴포넌트도 다시 마운트되므로 모듈 범위에 둔다
let refreshedFrom: Device | null = null

// 3-12: 서버는 user-agent로 화면을 고른다. 실제 화면과 다르면(좁힌 데스크톱 창, 가로 태블릿 등)
// 쿠키를 남기고 다시 받는다 — 고르지 않은 서버 트리는 클라이언트에 없어서 혼자 바꿀 수 없다
export function ViewportSync({ device }: { device: Device }) {
  const router = useRouter()
  useEffect(() => {
    const narrow = window.matchMedia(NARROW_QUERY)
    const landscapePhone = window.matchMedia(LANDSCAPE_PHONE_QUERY)
    const sync = () => {
      const want = viewportDevice({ narrow: narrow.matches, landscapePhone: landscapePhone.matches })
      document.cookie = `${VIEWPORT_COOKIE}=${want}; path=/; max-age=31536000; samesite=lax`
      if (shouldRefresh({ want, device, refreshedFrom })) {
        refreshedFrom = device
        router.refresh()
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
