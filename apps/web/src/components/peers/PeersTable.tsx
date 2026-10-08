import Link from 'next/link'
import type { PeersView } from '@/server/peers/view'

// Build Spec 2-10 frontend-components §2 — 1h 동료 현황 (프로토타입 L729–748)
const COLS = 'grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_1.4fr] items-center px-4'
const HEAD = ['성명', '이번달 OFF', '누적 OFF', '이번달 N', '잔여 N', '슬리핑오프', '주말 연휴 OFF']
const navBtn =
  'flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm hover:bg-panel'

export function PeersHeader({ view }: { view: PeersView }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Link href={`/peers?ym=${view.prevYm}`} aria-label="이전 달" className={navBtn}>
          ‹
        </Link>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{view.title}</h1>
        <Link href={`/peers?ym=${view.nextYm}`} aria-label="다음 달" className={navBtn}>
          ›
        </Link>
      </div>
      <div className="flex items-center gap-3 text-[13px] text-ink-2">
        <span>누적 OFF가 낮을수록, 잔여 N이 높을수록 다음 달 오프 배정 우선순위가 높습니다.</span>
        <span className="ml-auto">정렬: 누적 OFF ↑</span>
      </div>
    </div>
  )
}

export function PeersTable({ view }: { view: PeersView }) {
  if (view.empty)
    return (
      <div className="rounded-[10px] border border-line bg-surface p-8 text-center text-sm text-ink-2">
        {view.empty}
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface text-[13px]">
      <div role="table" aria-label="동료 현황" className="min-w-[720px]">
        <div role="row" className={`${COLS} bg-panel py-2.5 text-xs text-ink-2`}>
          {HEAD.map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
        </div>
        {view.rows.map((r) => (
          <div
            key={r.userId}
            role="row"
            aria-label={r.name}
            data-me={r.me || undefined}
            className={`${COLS} border-b border-line-soft py-3 last:border-b-0 ${r.me ? 'bg-primary-soft' : ''}`}
          >
            <span role="cell" className="flex items-center gap-1.5 font-semibold">
              {r.name}
              {r.me && (
                <span className="rounded-full bg-primary px-1.5 py-px text-[10px] text-white">나</span>
              )}
            </span>
            <span role="cell">{r.off}</span>
            <span role="cell" className="font-bold" data-col="acc">
              {r.acc}
            </span>
            <span role="cell">{r.nights}</span>
            <span role="cell" data-col="n-left">
              {r.nLeft}
            </span>
            <span role="cell">{r.sleeping}</span>
            <span role="cell" className="text-ink-2" data-col="weekend">
              {r.weekend}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
