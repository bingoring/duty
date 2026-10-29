'use client'

import { useEffect } from 'react'

// 3-12 모바일 아래 시트. 홈 화면 앱(standalone)에는 뒤로 가기가 없으므로 배경 탭·Escape·닫기 버튼으로 닫는다
export function BottomSheet({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="닫기" className="absolute inset-0 bg-ink/35" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[18px] bg-surface px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]"
      >
        <div aria-hidden className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-line" />
        {children}
      </div>
    </div>
  )
}
