'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { VIEWPORT_COOKIE, type Device } from '@/server/device'

const QUERY = '(max-width: 767px)'
// 셸이 바뀌면 이 컴포넌트도 다시 마운트되므로 모듈 범위에 둔다(쿠키가 막혀도 페이지당 한 번만 다시 받는다)
let refreshed = false

// 3-12: 서버는 user-agent로 화면을 고른다. 실제 화면 폭과 다르면(좁힌 데스크톱 창, 가로 태블릿 등)
// 쿠키를 남기고 한 번만 다시 받는다 — 고르지 않은 서버 트리는 클라이언트에 없어서 혼자 바꿀 수 없다
export function ViewportSync({ device }: { device: Device }) {
  const router = useRouter()
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const sync = () => {
      const want: Device = mq.matches ? 'mobile' : 'desktop'
      document.cookie = `${VIEWPORT_COOKIE}=${want}; path=/; max-age=31536000; samesite=lax`
      if (want !== device && !refreshed) {
        refreshed = true
        router.refresh()
      }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [device, router])
  return null
}
