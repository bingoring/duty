'use client'

import { useEffect } from 'react'

// R-AUTH-8: 로그인 유지 세션을 연장한다. 서버 컴포넌트는 쿠키를 쓸 수 없어 Route Handler를 한 번 부른다.
export function SessionKeeper() {
  useEffect(() => {
    void fetch('/api/session/refresh', { method: 'POST' })
  }, [])
  return null
}
