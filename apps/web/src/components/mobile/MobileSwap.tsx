'use client'

import { formatMD, weekdayKo, type IsoDate } from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReceivedList, SentList, SwapPopup } from '@/components/adjust/NurseAdjust'
import { swapDates, swapGroups } from '@/server/adjust/mobile'
import type { AdjustView } from '@/server/adjust/view'
import { BottomSheet } from './BottomSheet'

// 3-12 모바일 근무 교환 (시안 design-mobile 4-swap). 받은·보낸 요청 + 「＋ 교환 요청」 → 날짜 → 여러 명 → 데스크톱 재배정 창 그대로
const navBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-base active:bg-panel'
const CHIP: Record<string, string> = {
  D: 'bg-shift-d',
  E: 'bg-shift-e',
  N: 'bg-shift-n',
  S: 'bg-shift-s',
  OFF: 'bg-shift-off text-ink-2',
  휴가: 'bg-shift-leave',
}
const withDay = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`

export function MobileSwap({ view, viewerId }: { view: AdjustView; viewerId: string }) {
  const router = useRouter()
  const swap = view.swap
  const open = !!swap?.window.open
  const [sheet, setSheet] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const received = swap?.received.filter((c) => c.status === 'PENDING' && c.canRespond).length ?? 0

  // 데스크톱처럼 30초·포커스마다 상대의 수락·거절을 반영하되, 시트가 열려 있으면 미룬다
  const busy = useRef(false)
  useEffect(() => {
    busy.current = sheet
  }, [sheet])
  useEffect(() => {
    const tick = () => !busy.current && router.refresh()
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => (clearInterval(id), window.removeEventListener('focus', tick))
  }, [router])

  const done = (text: string, kind: 'ok' | 'err' = 'ok') => (setMsg({ kind, text }), router.refresh())
  const close = useCallback(() => setSheet(false), [])

  return (
    <div className="flex flex-col gap-3 px-4 pt-3.5 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-[19px] font-bold tracking-[-0.02em]">{view.month}월 근무 교환</h1>
        <div className="flex items-center gap-1">
          <Link href={`/adjust?ym=${view.grid.prev}`} aria-label="이전 달" className={navBtn}>
            ‹
          </Link>
          <Link href={`/adjust?ym=${view.grid.next}`} aria-label="다음 달" className={navBtn}>
            ›
          </Link>
        </div>
      </div>
      {!swap ? (
        <p className="rounded-xl bg-surface px-3.5 py-3 text-[13px] text-ink-2">
          확정된 근무표가 있는 달에서 교환을 요청할 수 있습니다.
        </p>
      ) : (
        <>
          <p
            className={`rounded-lg px-3 py-1.5 text-xs ${open ? 'bg-primary-soft text-primary' : 'bg-shift-off text-ink-2'}`}
          >
            {swap.window.label}
          </p>
          {msg && (
            <div role="status" className={`text-xs ${msg.kind === 'ok' ? 'text-primary' : 'text-danger'}`}>
              {msg.text}
            </div>
          )}
          <section aria-label="받은 요청" className="flex flex-col gap-2">
            <h2 className="text-xs font-bold text-ink-2">받은 요청 {received}</h2>
            <ReceivedList received={swap.received} onDone={done} />
          </section>
          <section aria-label="보낸 요청" className="flex flex-col gap-2">
            <h2 className="text-xs font-bold text-ink-2">보낸 요청 {swap.sent.length}</h2>
            <SentList sent={swap.sent} onDone={done} />
          </section>
          <button
            type="button"
            disabled={!open || !view.checkInput}
            onClick={() => (setMsg(null), setSheet(true))}
            className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 h-11 rounded-full bg-primary px-4 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(0,0,0,.18)] disabled:opacity-40"
          >
            ＋ 교환 요청
          </button>
        </>
      )}
      {sheet && swap && view.checkInput && (
        <BottomSheet label="교환 요청" onClose={close}>
          <NewSwap
            view={view}
            viewerId={viewerId}
            onClose={close}
            onSent={(text) => (setSheet(false), done(text))}
          />
        </BottomSheet>
      )}
    </div>
  )
}

function NewSwap(props: {
  view: AdjustView
  viewerId: string
  onClose: () => void
  onSent: (text: string) => void
}) {
  const { view, viewerId } = props
  const dates = swapDates(view)
  const [date, setDate] = useState<IsoDate>(() =>
    dates.includes(view.today) ? view.today : (dates[0] ?? view.today),
  )
  const [picked, setPicked] = useState<string[]>([])
  const [step, setStep] = useState<'pick' | 'swap'>('pick')
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [date])
  const { mine, groups } = swapGroups(view, date, viewerId)
  const nameOf = (id: string) => view.names[id]?.name ?? id

  if (step === 'swap')
    return (
      <SwapPopup
        variant="sheet"
        view={view}
        date={date}
        people={[viewerId, ...picked]}
        viewerId={viewerId}
        nameOf={nameOf}
        onClose={() => setStep('pick')}
        onSent={props.onSent}
      />
    )
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="text-[15px] font-bold">교환 요청</div>
      <div
        ref={strip}
        aria-label="날짜"
        role="group"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
      >
        {dates.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === date}
            aria-label={`${Number(d.slice(8))}일`}
            onClick={() => (setDate(d), setPicked([]))}
            className={`flex min-w-[40px] flex-col items-center rounded-[10px] py-1.5 text-[11px] ${
              d === date ? 'bg-ink text-white' : 'bg-panel text-ink-2'
            }`}
          >
            {weekdayKo(d)}
            <b className="text-[15px]">{Number(d.slice(8))}</b>
          </button>
        ))}
      </div>
      <div className="font-bold">
        {withDay(date)} · 나는 {mine ?? '근무 없음'}
      </div>
      {mine === null ? (
        <p className="text-xs text-ink-3">이 날은 근무표가 없습니다.</p>
      ) : (
        <>
          <p className="text-xs text-ink-2">맞바꿀 동료를 고르세요(여러 명 가능)</p>
          {groups.map((g) => (
            <div key={g.code} className="flex flex-col gap-1.5">
              <span
                className={`w-fit rounded-md px-1.5 text-[11px] font-bold ${CHIP[g.code] ?? 'bg-shift-off'}`}
              >
                {g.code === 'OFF' ? 'off' : g.code}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {g.people.map((p) => {
                  const on = picked.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!p.selectable}
                      onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
                      className={`rounded-full border px-3 py-1.5 text-[13px] disabled:opacity-35 ${
                        on ? 'border-ink bg-ink text-white' : 'border-line bg-surface'
                      }`}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={props.onClose}
          className="h-10 flex-1 rounded-lg border border-line bg-surface font-semibold"
        >
          취소
        </button>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => setStep('swap')}
          className="h-10 flex-1 rounded-lg bg-ink font-bold text-white disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  )
}
