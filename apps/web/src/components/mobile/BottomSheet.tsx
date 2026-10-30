'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { dragOffset, dragOutcome } from './sheet-drag'

// 3-12 모바일 아래 시트. 아래에서 올라오고 내려가며, 손잡이를 끌어내려 닫는다.
// open으로 제어한다: false가 되면 마지막 내용을 그린 채 내려간 뒤 사라진다(어떤 길로 닫아도 같은 애니메이션).
// 홈 화면 앱(standalone)에는 뒤로 가기가 없으므로 배경 탭·Escape·끌기·화면 안 버튼으로 닫는다
const DURATION = 280
const REDUCE = '(prefers-reduced-motion: reduce)'
const subscribeReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

export function BottomSheet({
  open,
  label,
  onClose,
  children,
  modal = true,
}: {
  open: boolean
  // false: 배경 없이 아래쪽만 덮는다(뒤 화면을 계속 누를 수 있다 — 의사 관리자 칩 두 개 맞바꾸기)
  modal?: boolean
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  // 올라오는 전환이 끝났는지(data-state="open" — 테스트·스타일용)
  const [settled, setSettled] = useState(false)
  // 끄는 중이면 끈 거리와 시트 높이(배경을 비례해서 밝힌다)
  const [drag, setDrag] = useState<{ dy: number; height: number } | null>(null)
  // 닫히는 동안에도 마지막 내용·이름을 그린다(렌더링 중 이전 값 맞추기)
  const [kept, setKept] = useState({ children, label })
  if (open && (kept.children !== children || kept.label !== label)) setKept({ children, label })
  if (open && !mounted) setMounted(true)
  if (!open && shown) setShown(false)
  if (!shown && settled) setSettled(false)
  // 「동작 줄이기」면 전환 없이 바로 열고 닫는다(전환 끝 이벤트가 오지 않으므로 바로 open)
  const reduce = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  )
  if (reduce && shown && !settled) setSettled(true)
  const panel = useRef<HTMLDivElement>(null)
  const track = useRef<{ startY: number; samples: { y: number; t: number }[] } | null>(null)

  // 열기: 붙인 뒤 다음 프레임에 올린다. 닫기: 내리고 전환이 끝나면 뗀다
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(id)
    }
    const t = setTimeout(() => setMounted(false), reduce ? 0 : DURATION + 40)
    return () => clearTimeout(t)
  }, [open, reduce])

  // 열려 있는 동안: 초점을 시트로, 배경 스크롤 잠금(iOS도 막히게 body를 고정), 닫히면 되돌린다
  useEffect(() => {
    if (!mounted || !modal) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    const y = window.scrollY
    const body = document.body.style
    const prev = { position: body.position, top: body.top, width: body.width }
    Object.assign(body, { position: 'fixed', top: `-${y}px`, width: '100%' })
    return () => {
      Object.assign(body, prev)
      window.scrollTo(0, y)
      before?.focus?.({ preventScroll: true })
    }
  }, [mounted, modal])

  if (!mounted) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    // 시트 안 창(교환 재배정 등)이 이미 처리한 Escape는 시트를 닫지 않는다
    if (e.key === 'Escape' && !e.defaultPrevented) return onClose()
    if (!modal || e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const first = items[0]!
    const lastItem = items[items.length - 1]!
    const target = e.shiftKey
      ? document.activeElement === first
        ? lastItem
        : null
      : document.activeElement === lastItem
        ? first
        : null
    if (target) {
      e.preventDefault()
      target.focus()
    }
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (!open) return
    e.currentTarget.setPointerCapture(e.pointerId)
    track.current = { startY: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }] }
    setDrag({ dy: 0, height: panel.current?.offsetHeight ?? 600 })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const tr = track.current
    if (!tr) return
    tr.samples = [...tr.samples.slice(-1), { y: e.clientY, t: e.timeStamp }]
    setDrag((d) => d && { ...d, dy: dragOffset(e.clientY - tr.startY) })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const tr = track.current
    track.current = null
    if (!tr) return
    const [a, b] = [tr.samples[0]!, { y: e.clientY, t: e.timeStamp }]
    const velocity = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0
    const out = dragOutcome({ dy: e.clientY - tr.startY, velocity, height: drag?.height ?? 600 })
    setDrag(null)
    if (out === 'close') onClose()
  }

  const transition = drag !== null || reduce ? 'none' : `transform ${DURATION}ms ${EASE}`
  const transform = drag ? `translateY(${drag.dy}px)` : shown ? 'translateY(0)' : 'translateY(100%)'
  const dim = shown ? 0.35 * (drag ? Math.max(0, 1 - drag.dy / drag.height) : 1) : 0
  return (
    // 내려가는 동안(open=false)에는 시트 전체를 누를 수 없게(inert) — 보내기 버튼을 두 번 누르는 일을 막는다
    <div className={`fixed inset-0 z-40 ${!open || !modal ? 'pointer-events-none' : ''}`}>
      {modal && (
        <div
          aria-hidden
          onClick={() => open && onClose()}
          className="absolute inset-0 bg-ink"
          style={{
            opacity: dim,
            transition: drag !== null || reduce ? 'none' : `opacity ${DURATION}ms ${EASE}`,
          }}
        />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-modal={modal}
        aria-label={open ? label : kept.label}
        inert={!open}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-state={settled ? 'open' : shown ? 'opening' : 'closing'}
        onTransitionEnd={(e) => e.target === e.currentTarget && shown && setSettled(true)}
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[18px] bg-surface shadow-[0_-8px_30px_rgba(0,0,0,.12)] outline-none ${modal ? 'max-h-[85dvh]' : 'pointer-events-auto max-h-[60dvh]'}`}
        style={{ transform, transition }}
      >
        <button
          type="button"
          aria-label="끌어서 닫기"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-line" />
        </button>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {open ? children : kept.children}
        </div>
      </div>
    </div>
  )
}
