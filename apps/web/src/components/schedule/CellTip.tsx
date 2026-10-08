'use client'

import { useEffect, useRef, useState } from 'react'

// Build Spec 2-11 R-TIP-1 — 격자 칸의 data-tip(줄바꿈으로 나눈 출처 줄)을 바로 뜨는 카드로 보여 준다.
// 브라우저 title은 1초 가까이 늦고 휴대폰에서 보이지 않는다. 격자 하나에 카드 하나(이벤트 위임)
const HOVER_MS = 150
const TOUCH_MS = 500

type Tip = { lines: string[]; x: number; y: number; below: boolean }

export function CellTip() {
  const anchor = useRef<HTMLSpanElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    // 감시 범위 = 이 컴포넌트를 넣은 부모(격자 카드)
    const grid = anchor.current?.parentElement ?? null
    if (!grid) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let current: HTMLElement | null = null
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip
      if (!text) return
      const r = el.getBoundingClientRect()
      const below = r.top < 90
      setTip({ lines: text.split('\n'), x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below })
    }
    const hide = () => {
      clearTimeout(timer)
      current = null
      setTip(null)
    }
    const cellOf = (t: EventTarget | null) =>
      (t as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = cellOf(e.target)
      if (el === current) return
      clearTimeout(timer)
      current = el
      if (!el) return setTip(null)
      timer = setTimeout(() => show(el), HOVER_MS)
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const el = cellOf(e.target)
      clearTimeout(timer)
      if (el) timer = setTimeout(() => show(el), TOUCH_MS)
    }
    const focus = (e: FocusEvent) => {
      const el = cellOf(e.target)
      if (el) show(el)
    }
    grid.addEventListener('pointerover', over)
    grid.addEventListener('pointerleave', hide)
    grid.addEventListener('pointerdown', down)
    grid.addEventListener('pointerup', () => clearTimeout(timer))
    grid.addEventListener('focusin', focus)
    grid.addEventListener('focusout', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      clearTimeout(timer)
      grid.removeEventListener('pointerover', over)
      grid.removeEventListener('pointerleave', hide)
      grid.removeEventListener('pointerdown', down)
      grid.removeEventListener('focusin', focus)
      grid.removeEventListener('focusout', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  return (
    <span ref={anchor} className="print:hidden">
      {tip && (
        <span
          role="tooltip"
          data-testid="cell-tip"
          className="pointer-events-none fixed z-50 flex max-w-[260px] flex-col gap-0.5 rounded-lg bg-ink px-2.5 py-2 text-xs leading-snug text-white shadow-lg"
          style={{
            left: tip.x,
            top: tip.y,
            transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
          }}
        >
          {tip.lines.map((l, i) => (
            <span key={i} className={i === 0 ? 'font-bold' : ''}>
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
