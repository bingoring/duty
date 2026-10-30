'use client'

import { formatMD, weekdayKo, type IsoDate } from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ProposalPanel } from '@/components/requests/ProposalPanel'
import { RequestPopover } from '@/components/requests/RequestPopover'
import { submitRequestsAction } from '@/server/requests/actions'
import type { RequestsView } from '@/server/requests/dto'
import { peerRequests, requestMonth, sameDayText, type PeerRequest } from '@/server/requests/mobile'
import type { ProposalDTO } from '@/server/requests/proposals'
import { BottomSheet } from './BottomSheet'

// 3-12 모바일 근무 신청 (시안 design-mobile 3-requests). 달력 → 날짜 시트(데스크톱 신청 팝오버 그대로 + 그날 동료 신청).
// 관리자(수간호사)는 보기 전용: 날짜별 누가 무엇을 신청했는지. 대신 신청은 PC에서
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const navBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-base active:bg-panel'

export function MobileRequests(props: {
  view: RequestsView
  viewerId: string
  today: IsoDate
  prevHref: string
  nextHref: string
  proposals: { pending: ProposalDTO[]; recent: ProposalDTO[] }
}) {
  const { view } = props
  const router = useRouter()
  const admin = view.isAdmin
  const [date, setDate] = useState<IsoDate | null>(null)
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  const month = requestMonth(view)
  const me = view.rows.find((r) => r.me)

  // 데스크톱처럼 30초·포커스마다 새로 그리되, 시트가 열려 있으면 미룬다(입력이 사라지지 않게)
  const open = useRef(false)
  useEffect(() => {
    open.current = date !== null
  }, [date])
  useEffect(() => {
    const tick = () => !open.current && router.refresh()
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => (clearInterval(id), window.removeEventListener('focus', tick))
  }, [router])

  const close = useCallback(() => setDate(null), [])
  const submit = () =>
    start(async () => {
      const r = await submitRequestsAction({ year: view.year, month: view.month })
      setMsg(r.ok ? `${'submitted' in r ? r.submitted : 0}건을 제출했습니다.` : r.message)
    })
  const daysLeft = view.deadline
    ? Math.round((Date.parse(view.deadline) - Date.parse(props.today)) / 86_400_000)
    : null

  return (
    <div className="flex flex-col gap-3 px-4 pt-3.5">
      <div className="flex items-center justify-between">
        <h1 className="text-[19px] font-bold tracking-[-0.02em]">{view.month}월 근무 신청</h1>
        <div className="flex items-center gap-1">
          <Link href={props.prevHref} aria-label="이전 달" className={navBtn}>
            ‹
          </Link>
          <Link href={props.nextHref} aria-label="다음 달" className={navBtn}>
            ›
          </Link>
        </div>
      </div>

      {admin ? (
        <p className="rounded-xl bg-admin-soft px-3.5 py-2.5 text-xs text-admin">
          날짜를 누르면 그날 신청을 봅니다 · 대신 신청은 PC에서
        </p>
      ) : (
        <section
          aria-label="내 신청"
          className="flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white"
        >
          <div className="min-w-0 text-xs">
            {view.deadline && (
              <div className="opacity-75">
                마감 {formatMD(view.deadline)}
                {daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft}일 남음` : ''}
              </div>
            )}
            <div className="mt-0.5 text-[14px] font-bold">{view.cards?.mineText ?? '내 신청'}</div>
            {view.unsubmitted > 0 && <div className="opacity-75">제출 전 {view.unsubmitted}건</div>}
          </div>
          <button
            type="button"
            disabled={pending || view.unsubmitted === 0 || view.editable === 'none'}
            onClick={submit}
            className="h-9 shrink-0 rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            신청 제출
          </button>
        </section>
      )}
      {msg && (
        <div role="status" className="text-xs text-primary">
          {msg}
        </div>
      )}

      <ProposalPanel admin={admin} pending={props.proposals.pending} recent={props.proposals.recent} />

      <div
        role="group"
        aria-label={`${view.month}월 신청 달력`}
        className="grid grid-cols-7 gap-[3px] text-center text-[11px]"
      >
        {WEEK.map((w, i) => (
          <div key={w} className={`py-0.5 ${i === 0 ? 'text-danger' : 'text-ink-3'}`}>
            {w}
          </div>
        ))}
        {month.weeks.flat().map((d, i) =>
          d ? (
            <button
              key={d.date}
              type="button"
              aria-label={`${d.day}일${d.mine ? ` ${d.mine.label}` : ''}`}
              onClick={() => setDate(d.date)}
              className={`flex h-[52px] flex-col items-center gap-0.5 rounded-md bg-surface pt-1 ${
                d.date === date ? 'outline-2 outline-ink' : ''
              }`}
            >
              <span className={d.red ? 'text-danger' : 'text-ink-2'}>{d.day}</span>
              {d.mine && (
                <span
                  className={`relative inline-flex h-[17px] min-w-[24px] items-center justify-center rounded-[5px] px-0.5 text-[10px] font-bold text-danger outline-[1.5px] outline-danger ${
                    d.mine.draft ? 'outline-dashed' : 'outline-solid'
                  } ${d.mine.kind === 'leave' ? 'bg-shift-leave' : 'bg-surface'}`}
                >
                  {d.mine.label}
                  {d.mine.byAdmin && (
                    <span
                      aria-label="관리자가 넣음"
                      className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-admin"
                    />
                  )}
                </span>
              )}
              <span className={`mt-auto pb-0.5 text-[9px] ${d.hot ? 'font-bold text-danger' : 'text-ink-3'}`}>
                {admin ? `신청 ${d.count}` : `쉼 ${d.rest}`}
              </span>
            </button>
          ) : (
            <div key={`b${i}`} />
          ),
        )}
      </div>
      <p className="text-[11px] text-ink-3">
        「쉼 n」 = 그날 쉬겠다고 신청한 사람 수(3명 이상이면 빨강) · 빨간 테두리 = 내 신청, 점선 = 제출 전
      </p>

      <BottomSheet
        open={date !== null}
        label={date ? `${formatMD(date)} (${weekdayKo(date)}) 신청` : ''}
        onClose={close}
      >
        {date && <DaySheet view={view} viewerId={props.viewerId} date={date} me={me} onClose={close} />}
      </BottomSheet>
    </div>
  )
}

function DaySheet(props: {
  view: RequestsView
  viewerId: string
  date: IsoDate
  me: RequestsView['rows'][number] | undefined
  onClose: () => void
}) {
  const { view, date, me } = props
  const cell = me?.cells.find((c) => c.date === date)
  const peers: PeerRequest[] = view.isAdmin
    ? [
        ...(cell?.kind && !cell.draft
          ? [
              {
                userId: me!.userId,
                name: me!.name,
                label: cell.label,
                kind: cell.kind,
                byAdmin: !!cell.byAdmin,
              },
            ]
          : []),
        ...peerRequests(view, date),
      ]
    : peerRequests(view, date)
  return (
    <div className="flex flex-col gap-3">
      {view.isAdmin ? (
        <div className="text-[15px] font-bold">
          {formatMD(date)} ({weekdayKo(date)}) 신청
        </div>
      ) : view.editable === 'none' || !me || !cell ? (
        <>
          <div className="text-[15px] font-bold">
            {formatMD(date)} ({weekdayKo(date)})
          </div>
          <p className="text-xs text-ink-2">신청 기간이 아닙니다.</p>
        </>
      ) : (
        <RequestPopover
          key={date}
          variant="sheet"
          userId={props.viewerId}
          userName={me.name}
          head={me.head}
          own
          cell={cell}
          sameDay={sameDayText(view, props.viewerId, date)}
          mode={view.editable === 'all' ? 'all' : 'leave'}
          isAdmin={false}
          onClose={props.onClose}
        />
      )}
      <section aria-label="이 날 신청한 동료" className="border-t border-line-soft pt-2.5">
        <h2 className="mb-1.5 text-xs font-bold text-ink-2">
          이 날 신청한 {view.isAdmin ? '사람' : '동료'} {peers.length}명
        </h2>
        {peers.length === 0 ? (
          <p className="text-xs text-ink-3">아직 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-[13px]">
            {peers.map((p) => (
              <li key={p.userId} className="flex items-center justify-between">
                <span>
                  {p.name}
                  {p.byAdmin && (
                    <span
                      aria-label="관리자가 넣음"
                      className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-admin align-middle"
                    />
                  )}
                </span>
                <span className={`font-semibold ${p.kind === 'leave' ? 'text-ink' : 'text-danger'}`}>
                  {p.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {view.isAdmin && (
        <button
          type="button"
          onClick={props.onClose}
          className="h-10 rounded-lg border border-line bg-surface text-[13px] font-semibold"
        >
          닫기
        </button>
      )}
    </div>
  )
}
