'use client'

import { formatMD } from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useHydrated } from '@/components/admin/ui'
import { decideLeaveAction, submitRequestsAction } from '@/server/requests/actions'
import type { PendingLeave, RequestCellDTO, RequestsView } from '@/server/requests/dto'
import { RequestPopover } from './RequestPopover'

// S4 근무 신청 · S5 휴가 · S4-A 휴가 승인 (Build Spec 2-5 frontend-components)
const CHIP_BG: Record<string, string> = {
  O: 'bg-shift-off',
  D: 'bg-shift-d',
  E: 'bg-shift-e',
  N: 'bg-shift-n',
  교: 'bg-shift-off',
}
const DAY_COLOR = { sun: 'text-danger', sat: 'text-admin', plain: 'text-ink-2' }
const PANEL_KEY = 'duty.leavePanel.collapsed'

function Chip({ c, compact = false }: { c: RequestCellDTO; compact?: boolean }) {
  if (!c.kind) {
    return c.scheduled ? <span className="text-[10px] text-ink-3">{c.scheduled}</span> : null
  }
  const leave = c.kind === 'leave'
  const approved = c.leave?.status === 'APPROVED'
  const rejected = c.leave?.status === 'REJECTED'
  const multi = c.label.includes('/')
  const size =
    c.label.length > 3 || (compact && multi)
      ? 'text-[8px]'
      : multi
        ? 'text-[9.5px]'
        : compact
          ? 'text-[10px]'
          : 'text-[11px]'
  const box = compact ? 'h-[22px] min-w-[20px] px-[1px]' : 'h-[26px] min-w-[26px] px-[3px]'
  const bg = leave
    ? approved
      ? 'bg-shift-leave'
      : 'bg-surface'
    : multi
      ? 'bg-surface'
      : (CHIP_BG[c.label] ?? 'bg-shift-off')
  const outline = leave
    ? approved
      ? ''
      : 'border border-dashed border-[#8fa874]'
    : 'shadow-[inset_0_0_0_1.5px_var(--color-danger)]'
  return (
    <span
      className={`flex items-center justify-center rounded-md font-bold text-ink ${box} ${size} ${bg} ${outline} ${
        c.draft ? 'opacity-60' : ''
      } ${rejected ? 'line-through opacity-50' : ''} ${c.hasComment ? 'underline decoration-ink-2 decoration-dotted underline-offset-[3px]' : ''}`}
    >
      {c.label}
    </span>
  )
}

function useCollapsed(): [boolean, (v: boolean) => void] {
  // 접힘 상태는 브라우저에 기억(핸드오프 v4 4a). 서버 렌더링에서는 펼침
  const read = () => {
    try {
      return localStorage.getItem(PANEL_KEY) === '1'
    } catch {
      return false
    }
  }
  const [, force] = useState(0)
  const value = useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb)
      return () => window.removeEventListener('storage', cb)
    },
    read,
    () => false,
  )
  return [
    value,
    (v) => {
      try {
        localStorage.setItem(PANEL_KEY, v ? '1' : '0')
      } catch {}
      force((n) => n + 1)
    },
  ]
}

// 4a 휴가 승인 패널 (핸드오프 v4 4a와 같은 치수·색)
const toggleBtn =
  'h-7 cursor-pointer whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2'

function ApprovalCard({ p }: { p: PendingLeave }) {
  const router = useRouter()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const decide = (decision: 'approve' | 'reject') =>
    start(async () => {
      const r = await decideLeaveAction({ id: p.id, decision, ...(decision === 'reject' ? { reason } : {}) })
      if (!r.ok) return setError(r.message)
      // 2-7 R-LEAVE-C1: 확정된 달에 인원이 모자라면 S9 대체 지정으로
      if (decision === 'approve' && p.focus)
        router.push(`/adjust?ym=${p.focus.ym}&focus=${p.focus.date}&shift=${p.focus.shift}`)
    })
  const warn = p.impact !== null && p.impact.length > 0
  return (
    <div
      role="article"
      aria-label={`${p.name} 휴가`}
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3"
    >
      <div className="flex items-center justify-between">
        <span className="font-bold">{p.name}</span>
        <span
          className={`rounded-full px-[7px] py-0.5 text-[11px] font-bold ${
            p.confirmedMonth ? 'bg-warn-bg text-warn-ink' : 'bg-primary-soft text-primary'
          }`}
        >
          {p.monthLabel}
        </span>
      </div>
      <div className="font-semibold">{p.kindLabel}</div>
      <div className="text-xs text-ink-2">
        {p.range} · {p.days}일 · 유급
      </div>
      {p.comment && <div className="rounded-md bg-panel px-2 py-1.5 text-xs text-nav-ink">“{p.comment}”</div>}
      <div
        className={`rounded-md px-2 py-1.5 text-xs leading-[1.5] ${warn ? 'bg-danger-bg text-danger-ink' : 'bg-primary-soft text-primary-hover'}`}
      >
        {p.impact === null
          ? `${p.monthLabel.split(' ')[0]} 듀티 생성 시 자동 반영 · 인원 영향 없음`
          : warn
            ? `${p.impact.join(' · ')} → 대체 필요`
            : '승인하면 근무표에 바로 반영 · 인원 영향 없음'}
      </div>
      {warn && (
        <div className="text-xs text-ink-2">
          {p.candidates.length > 0
            ? `대체 후보: ${p.candidates.join(' · ')}`
            : '대체 후보: 그날 OFF인 교대 근무자가 없습니다'}
        </div>
      )}
      {rejecting && (
        <input
          aria-label="반려 사유"
          autoFocus
          placeholder="반려 사유"
          className="h-8 rounded-lg border border-line px-2 text-xs"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {error && <div className="text-xs text-danger">{error}</div>}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          className="h-[34px] flex-1 cursor-pointer rounded-lg border border-line bg-surface text-xs"
          onClick={() => (rejecting ? decide('reject') : setRejecting(true))}
        >
          {rejecting ? '반려 확정' : '반려'}
        </button>
        <button
          type="button"
          disabled={pending}
          className="h-[34px] flex-[1.4] cursor-pointer rounded-lg bg-primary text-xs font-bold text-white"
          onClick={() => decide('approve')}
        >
          {/* 확정된 달: 승인 후 대체 지정은 2-7 근무 조정 팝오버에서 */}
          {p.confirmedMonth ? '승인 · 대체 지정' : '승인'}
        </button>
      </div>
    </div>
  )
}

function ApprovalPanel({
  view,
  collapsed,
  setCollapsed,
}: {
  view: RequestsView
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}) {
  if (collapsed)
    return (
      <aside aria-label="휴가 승인" className="flex flex-col items-center gap-2.5">
        <button type="button" className={toggleBtn} onClick={() => setCollapsed(false)}>
          ‹ 펼치기
        </button>
        <div className="relative mt-1.5">
          <span className="text-xs font-bold tracking-[.08em] text-ink [writing-mode:vertical-rl]">
            휴가 승인
          </span>
          <span className="absolute -top-1.5 -right-2.5 rounded-full bg-danger px-[5px] text-[10px] font-bold text-white">
            {view.pending.length}
          </span>
        </div>
      </aside>
    )
  return (
    <aside aria-label="휴가 승인" className="flex min-h-0 min-w-0 flex-col gap-2.5 text-[13px]">
      <div className="flex items-center gap-1.5">
        <span className="text-[15px] font-bold">휴가 승인</span>
        <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
          {view.pending.length}
        </span>
        <button type="button" className={`ml-auto ${toggleBtn}`} onClick={() => setCollapsed(true)}>
          접기 ›
        </button>
      </div>
      {view.pending.length === 0 && <div className="text-xs text-ink-3">승인 대기 휴가가 없습니다.</div>}
      {view.pending.map((p) => (
        <ApprovalCard key={p.id} p={p} />
      ))}
      <div className="px-0.5 pt-1 text-[11px] font-semibold tracking-[.06em] text-ink-3">처리 이력</div>
      <div className="rounded-[10px] border border-line-soft bg-surface px-3 py-1">
        {view.history.length === 0 && <div className="py-[7px] text-xs text-ink-3">아직 없습니다.</div>}
        {view.history.map((h, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border-b border-line-soft py-[7px] text-xs last:border-b-0"
          >
            <span className="font-semibold whitespace-nowrap">{h.name}</span>
            <span className="min-w-0 truncate text-ink-2">{h.kindLabel}</span>
            <span
              className={`text-[11px] font-bold whitespace-nowrap ${h.status === 'APPROVED' ? 'text-primary' : 'text-danger'}`}
            >
              {h.status === 'APPROVED' ? '승인' : `반려${h.reason ? ` · ${h.reason}` : ''}`}
            </span>
            <span className="ml-auto whitespace-nowrap text-ink-3">{h.when}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

// 범례(3b). 관리자는 헤더 아래 별도 줄 + 코멘트 안내(4a)
function Legend({ admin = false }: { admin?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs text-ink-2 ${admin ? '' : 'ml-auto'}`}>
      <span className="rounded-[5px] bg-shift-off px-2 py-[3px] font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--color-danger)]">
        O
      </span>
      <span className="rounded-[5px] bg-surface px-2 py-[3px] font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--color-danger)]">
        O/D
      </span>
      신청
      <span className="ml-1.5 rounded-[5px] bg-shift-leave px-2 py-[3px] font-bold text-ink">휴</span>
      휴가{admin ? '' : ' (연차·경조·병가·공가·특휴)'}
      <span className="ml-1.5 underline decoration-dotted underline-offset-[3px]">밑줄</span>
      코멘트{admin ? ' — 관리자는 셀에 마우스를 올리면 코멘트 전문이 보입니다' : ''}
    </div>
  )
}

export function RequestsScreen({
  view,
  viewerId,
  today,
  prev,
  next,
}: {
  view: RequestsView
  viewerId: string
  today: string
  prev: string
  next: string
}) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [collapsed, setCollapsed] = useCollapsed()
  const [sel, setSel] = useState<{ userId: string; date: string; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<string>('')
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  // R-REQ-VIEW-7: 30초마다·창 포커스 때 새로고침(팝오버가 열려 있으면 미룸)
  const selRef = useRef(sel)
  useEffect(() => {
    selRef.current = sel
  }, [sel])
  useEffect(() => {
    const tick = () => !selRef.current && router.refresh()
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => (clearInterval(id), window.removeEventListener('focus', tick))
  }, [router])

  const admin = view.isAdmin
  // 관리자는 승인 패널 자리만큼 좁아지므로 날짜 열이 남는 폭을 나눠 쓴다(4a 이름 70px)
  const template = admin
    ? `70px repeat(${view.days.length},minmax(0,1fr)) 36px`
    : `96px repeat(${view.days.length},30px) 56px`
  const canEdit = (userId: string) => view.editable !== 'none' && (admin || userId === viewerId)
  const daysLeft = view.deadline
    ? Math.round((Date.parse(view.deadline) - Date.parse(today)) / 86_400_000)
    : 0
  const badge =
    view.planStatus === 'REQUESTING' && view.deadline && today <= view.deadline
      ? {
          text: `신청 중 · 마감 ${formatMD(view.deadline)}${admin ? '' : ` (${daysLeft}일 남음)`}`,
          cls: 'bg-warn-bg text-warn-ink',
        }
      : view.planStatus === 'REQUESTING' || view.planStatus === 'REQUEST_CLOSED'
        ? { text: '마감', cls: 'bg-line-soft text-ink-2' }
        : view.planStatus === 'CONFIRMED'
          ? { text: '확정된 달 · 휴가만 신청', cls: 'bg-line-soft text-ink-2' }
          : view.planStatus
            ? { text: '근무표 생성됨', cls: 'bg-line-soft text-ink-2' }
            : { text: `신청 기간 전`, cls: 'bg-line-soft text-ink-2' }

  const open = (userId: string, date: string, e: React.MouseEvent) => {
    if (!canEdit(userId) || !box.current) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const b = box.current.getBoundingClientRect()
    setSel({ userId, date, x: Math.min(r.left - b.left, b.width - 350), y: r.bottom - b.top + 4 })
  }
  const selRow = sel && view.rows.find((r) => r.userId === sel.userId)
  const selCell = selRow?.cells.find((c) => c.date === sel!.date)
  const sameDay = sel
    ? view.rows
        .filter((r) => r.userId !== sel.userId)
        .map((r) => ({ r, c: r.cells.find((c) => c.date === sel.date)! }))
        .filter(({ c }) => c.kind && !c.draft)
        .map(({ r, c }) => `${r.name} ${c.label}`)
        .join(' · ')
    : ''

  const submit = () =>
    start(async () => {
      const r = await submitRequestsAction({ year: view.year, month: view.month })
      setMsg(r.ok ? `${'submitted' in r ? r.submitted : 0}건을 제출했습니다.` : r.message)
    })

  return (
    <div
      data-hydrated={hydrated || undefined}
      className={`grid px-4 py-[18px] ${
        admin
          ? `gap-3 transition-[grid-template-columns] duration-200 ${collapsed ? 'grid-cols-[minmax(0,1fr)_72px]' : 'grid-cols-[minmax(0,1fr)_260px]'}`
          : 'gap-4'
      }`}
    >
      <div ref={box} className="relative flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/requests?ym=${prev}`}
              aria-label="이전 달"
              className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm"
            >
              ‹
            </Link>
            <h1 className="text-xl font-bold tracking-[-0.02em] whitespace-nowrap">
              {view.year}년 {view.month}월 · 근무 신청
            </h1>
            <Link
              href={`/requests?ym=${next}`}
              aria-label="다음 달"
              className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm"
            >
              ›
            </Link>
          </div>
          <span className={`rounded-full px-2 py-[3px] text-xs font-semibold whitespace-nowrap ${badge.cls}`}>
            {badge.text}
          </span>
          {admin && (
            <span className="ml-auto text-xs whitespace-nowrap text-ink-2">
              {view.headerCounts.requests}건 · 코멘트 {view.headerCounts.comments} · 휴가 대기{' '}
              <b className="text-danger">{view.headerCounts.pending}</b>
            </span>
          )}
          {!admin && <Legend />}
        </div>

        {admin && <Legend admin />}

        {view.cards && (
          <div className="grid grid-cols-4 gap-2" aria-label="내 신청 요약">
            <div className="rounded-[10px] bg-ink px-3.5 py-2.5 text-[13px] font-semibold text-white">
              {view.cards.mineText}
            </div>
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[13px]">
              {view.cards.offTargetText}
              {view.cards.overTarget && (
                <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn-ink">
                  OFF 신청 목표 초과
                </span>
              )}
            </div>
            <div className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[13px] text-primary">
              {view.cards.weekendText}
            </div>
            <div className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[13px] text-danger">
              {view.cards.wardText}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
          <div
            role="grid"
            aria-label={`${view.month}월 근무 신청`}
            className="grid text-[11px]"
            style={{ gridTemplateColumns: template }}
          >
            <div className="row-span-2 flex items-center justify-center border-r border-b border-line bg-panel text-ink-2">
              성명
            </div>
            {view.days.map((d) => (
              <div
                key={d.date}
                className={`flex h-[18px] items-center justify-center border-r border-b border-line-soft ${d.red ? 'bg-weekend-head font-bold' : 'bg-panel'}`}
              >
                {d.day}
              </div>
            ))}
            <div className="row-span-2 flex items-center justify-center border-b border-l border-line bg-panel text-ink-2">
              {admin ? '건' : '신청'}
            </div>
            {view.days.map((d) => (
              <div
                key={d.date}
                className={`flex h-[18px] items-center justify-center border-r border-b border-r-line-soft border-b-line text-[10px] ${d.red ? 'bg-weekend-head' : 'bg-panel'} ${DAY_COLOR[d.color]}`}
              >
                {d.weekday}
              </div>
            ))}
            {view.rows.map((r) => (
              <div key={r.userId} role="row" aria-label={r.name} className="contents">
                <div
                  className={`flex h-9 items-center gap-1 truncate border-r border-b border-line border-b-line-soft pl-2 font-semibold ${r.me ? 'shadow-[inset_3px_0_0_var(--color-primary)]' : ''}`}
                >
                  <span className={r.head ? 'text-admin' : ''}>{r.name}</span>
                  {r.me && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                      나
                    </span>
                  )}
                </div>
                {r.cells.map((c, i) => {
                  const d = view.days[i]!
                  const editable = canEdit(r.userId)
                  const selected = sel?.userId === r.userId && sel.date === c.date
                  return (
                    <button
                      key={c.date}
                      type="button"
                      data-date={c.date}
                      aria-label={`${r.name} ${c.date}`}
                      title={c.draft ? '제출 전' : c.leave ? c.leave.kindLabel : undefined}
                      disabled={!editable}
                      className={`flex h-9 items-center justify-center border-r border-b border-line-soft ${d.red ? 'bg-weekend-cell' : ''} ${
                        editable ? 'cursor-pointer' : 'cursor-default'
                      } ${selected ? 'outline-2 -outline-offset-2 outline-ink' : ''}`}
                      onClick={(e) => open(r.userId, c.date, e)}
                      onMouseEnter={() =>
                        admin &&
                        c.comment &&
                        setHover(`${formatMD(c.date)} ${r.name} · ${c.label}|${c.comment}`)
                      }
                    >
                      {c.kind ? (
                        <Chip c={c} compact={admin} />
                      ) : r.me && editable ? (
                        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-dashed border-ink-5 text-xs text-ink-4">
                          +
                        </span>
                      ) : (
                        <Chip c={c} compact={admin} />
                      )}
                    </button>
                  )
                })}
                <div className="flex h-9 items-center justify-center border-b border-l border-line border-b-line-soft font-semibold text-ink-2">
                  {r.count || ''}
                </div>
              </div>
            ))}
            <div className="flex h-[30px] items-center border-t border-r border-line bg-panel px-2 text-[10.5px] text-ink-2">
              OFF 신청{admin ? '' : ' 인원'}
            </div>
            {view.days.map((d) => {
              const n = view.offCounts[d.date] ?? 0
              return (
                <div
                  key={d.date}
                  data-off-count={d.date}
                  className={`flex h-[30px] items-center justify-center border-t border-r border-line-soft font-semibold ${n >= 3 ? 'bg-danger-bg text-danger' : 'bg-panel text-ink-2'}`}
                >
                  {n || ''}
                </div>
              )
            })}
            <div className="flex h-[30px] items-center justify-center border-t border-l border-line bg-panel text-[10px] font-semibold text-danger">
              3+ 주의
            </div>
          </div>
        </div>

        {admin && hover && (
          <div
            className="flex gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs"
            aria-label="코멘트"
          >
            <span className="font-semibold">{hover.split('|')[0]}</span>
            <span>&quot;{hover.split('|').slice(1).join('|')}&quot;</span>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-ink-2">
          <span>
            여러 개를 고르면 그중 하나로 배정됩니다. · 코멘트는 수간호사만 봅니다. · 휴가는 관리자 승인 후
            근무표에 반영됩니다. 증빙 서류는 병원 공문으로 별도 제출.
          </span>
          {view.negotiation && (
            <span className="ml-auto">
              마감 후 <b className="text-ink">{view.negotiation}</b> 협의 수정
            </span>
          )}
          {!admin && (
            <>
              {view.unsubmitted > 0 && (
                <span className="font-semibold text-warn-ink">제출하지 않은 신청 {view.unsubmitted}건</span>
              )}
              <button
                type="button"
                disabled={pending || view.unsubmitted === 0 || view.editable === 'none'}
                className="h-[34px] cursor-pointer rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:cursor-default disabled:opacity-50"
                onClick={submit}
              >
                신청 제출
              </button>
            </>
          )}
        </div>
        {msg && (
          <div role="status" className="text-xs text-primary">
            {msg}
          </div>
        )}

        {sel && selRow && selCell && (
          <div className="absolute z-20" style={{ left: Math.max(0, sel.x), top: sel.y }}>
            <RequestPopover
              key={`${sel.userId}|${sel.date}`}
              userId={sel.userId}
              userName={selRow.name}
              head={selRow.head}
              cell={selCell}
              sameDay={sameDay}
              mode={view.editable === 'all' ? 'all' : 'leave'}
              isAdmin={admin}
              onClose={() => setSel(null)}
            />
          </div>
        )}
      </div>
      {admin && <ApprovalPanel view={view} collapsed={collapsed} setCollapsed={setCollapsed} />}
    </div>
  )
}
