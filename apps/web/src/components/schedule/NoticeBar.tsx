'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { ackNoticesAction } from '@/server/notices/actions'
import type { Notice } from '@/server/notices/service'

// Build Spec 2-7 R-NOTICE-1·2 (Q3) — 근무표 상단 "내 근무가 바뀌었습니다" 띠
export function NoticeBar({
  items,
  more,
  seenUpTo,
  swaps = 0,
}: {
  items: Notice[]
  more: number
  seenUpTo: string | null
  swaps?: number
}) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const params = useSearchParams()
  if (items.length === 0 && swaps === 0) return null
  // 2-8 R-SWAP-12: 처리할 일(받은 교환 요청)은 근무 조정으로 보낸다
  const swapLine = swaps > 0 && (
    <Link href="/adjust" className="font-semibold text-ink underline-offset-2 hover:underline">
      받은 교환 요청 {swaps}건 → 근무 조정
    </Link>
  )
  if (items.length === 0)
    return (
      <div
        role="status"
        aria-label="받은 교환 요청"
        data-print="hide"
        className="flex items-center gap-3 rounded-[10px] border border-line bg-[#FFF9E8] px-3 py-2.5 text-[13px]"
      >
        {swapLine}
      </div>
    )
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
            <Link
              href={`/?ym=${n.ym}&focus=${n.date}`}
              className="font-semibold text-ink underline-offset-2 hover:underline"
            >
              {n.label}
            </Link>{' '}
            · {n.by} {n.at}
          </span>
        ))}
        {more > 0 && <span className="text-xs text-ink-3">외 {more}건</span>}
        {swapLine}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (seenUpTo) await ackNoticesAction(seenUpTo)
            // 확인하면 링크로 짚은 칸 강조(?focus)도 함께 지운다
            const ym = params.get('ym')
            if (params.get('focus')) router.replace(ym ? `/?ym=${ym}` : '/')
          })
        }
        className="ml-auto h-7 flex-none cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-xs"
      >
        확인
      </button>
    </div>
  )
}
