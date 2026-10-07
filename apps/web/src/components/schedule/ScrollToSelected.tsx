'use client'

import { useEffect } from 'react'

// 2-7 바뀐 근무 안내 링크로 왔을 때 강조한 칸이 보이도록 스크롤한다
export function ScrollToSelected({ focus }: { focus: string | null }) {
  useEffect(() => {
    if (!focus) return
    document.querySelector('[data-selected]')?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [focus])
  return null
}
