'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ackNoticesAction } from '@/server/notices/actions'
import type { Notice } from '@/server/notices/service'

// Build Spec 2-7 R-NOTICE-1·2 (Q3) — 근무표 상단 "내 근무가 바뀌었습니다" 띠
export function NoticeBar({ items, more }: { items: Notice[]; more: number }) {
  const [pending, start] = useTransition()
  if (items.length === 0) return null
  return (
    <div
      role="status"
      aria-label="바뀐 근무"
      data-print="hide"
      className="flex items-start gap-3 rounded-[10px] border border-line bg-[#FFF9E8] px-3 py-2.5 text-[13px]"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <b>내 근무가 바뀌었습니다</b>
        {items.map((n) => (
          <span key={n.date} className="text-ink-2">
            <Link href={`/?ym=${n.ym}`} className="font-semibold text-ink underline-offset-2 hover:underline">
              {n.label}
            </Link>{' '}
            · {n.by} {n.at}
          </span>
        ))}
        {more > 0 && <span className="text-xs text-ink-3">외 {more}건</span>}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => void (await ackNoticesAction()))}
        className="ml-auto h-7 flex-none cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-xs"
      >
        확인
      </button>
    </div>
  )
}
