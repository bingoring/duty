import Link from 'next/link'
import type { ScheduleView } from '@/server/schedule/view'
import { PrintButton } from './PrintButton'

const LEGEND: [string, string][] = [
  ['D', 'bg-shift-d'],
  ['E', 'bg-shift-e'],
  ['N', 'bg-shift-n'],
  ['OFF', 'bg-shift-off'],
  ['S', 'bg-shift-s'],
]

const navBtn =
  'flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm hover:bg-panel'

// 1c 헤더: ‹ 제목 › · 배지 · 범례 · 인쇄 (Build Spec 2-3 frontend-components §2)
export function ScheduleHeader({ view }: { view: ScheduleView }) {
  return (
    <div className="flex items-center gap-3" data-print="hide">
      <div className="flex items-center gap-1.5">
        <Link href={`/?ym=${view.prev}`} aria-label="이전 달" className={navBtn}>
          ‹
        </Link>
        <h1 className="text-xl font-bold tracking-[-0.02em]">{view.title}</h1>
        <Link href={`/?ym=${view.next}`} aria-label="다음 달" className={navBtn}>
          ›
        </Link>
      </div>
      {view.badge && (
        <span
          className={`rounded-full px-2 py-[3px] text-xs font-semibold ${
            view.badge.kind === 'confirmed' ? 'bg-primary-soft text-primary' : 'bg-line-soft text-ink-2'
          }`}
        >
          {view.badge.text}
        </span>
      )}
      {view.nextMonthLink && (
        <Link href={`/?ym=${view.nextMonthLink.ym}`} className="text-xs text-primary underline">
          {view.nextMonthLink.text} →
        </Link>
      )}
      <div className="ml-auto flex items-center gap-1.5 text-xs">
        {LEGEND.map(([label, bg]) => (
          <span key={label} className={`rounded-[5px] px-2 py-[3px] font-bold text-ink ${bg}`}>
            {label}
          </span>
        ))}
        <span className="ml-1.5 flex items-center gap-2 text-ink-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-3.5 w-3.5 rounded shadow-[inset_0_0_0_1.5px_var(--color-danger)]" />
            신청
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3.5 w-3.5 rounded shadow-[inset_0_0_0_2px_var(--color-admin)]" />
            관리자 수정
          </span>
        </span>
      </div>
      <PrintButton />
    </div>
  )
}
