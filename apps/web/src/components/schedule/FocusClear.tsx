'use client'

import { useRouter } from 'next/navigation'

// 바뀐 근무 안내 링크로 강조한 열(?focus=날짜)을 누르면 강조를 지운다(사용자 요청 2026-10-07)
export function FocusClear({ focus, ym, children }: { focus: string | null; ym: string; children: React.ReactNode }) {
  const router = useRouter()
  if (!focus) return children
  return (
    <div
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-date],[data-day]')
        const date = el?.dataset.date ?? el?.dataset.day
        if (date === focus) router.replace(`/?ym=${ym}`, { scroll: false })
      }}
    >
      {children}
    </div>
  )
}
