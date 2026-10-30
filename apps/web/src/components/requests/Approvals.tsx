'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cancelApprovedLeaveAction } from '@/server/adjust/actions'
import { decideLeaveAction } from '@/server/requests/actions'
import type { LeaveHistory, PendingLeave } from '@/server/requests/dto'

// S4-A 휴가 승인 카드·처리 이력. 데스크톱 근무 신청 패널과 3-12 모바일 관리 탭이 같이 쓴다
type FocusHref = (f: NonNullable<PendingLeave['focus']>) => string
// 2-7 R-LEAVE-C1: 데스크톱은 확정된 달 인원이 모자라면 근무 조정의 대체 지정으로
const ADJUST_FOCUS: FocusHref = (f) => `/adjust?ym=${f.ym}&focus=${f.date}&shift=${f.shift}`

export function ApprovalList({
  pending,
  history,
  focusHref = ADJUST_FOCUS,
}: {
  pending: PendingLeave[]
  history: LeaveHistory[]
  focusHref?: FocusHref
}) {
  return (
    <>
      {pending.length === 0 && <div className="text-xs text-ink-3">승인 대기 휴가가 없습니다.</div>}
      {pending.map((p) => (
        <ApprovalCard key={p.id} p={p} focusHref={focusHref} />
      ))}
      <div className="px-0.5 pt-1 text-[11px] font-semibold tracking-[.06em] text-ink-3">처리 이력</div>
      <div className="rounded-[10px] border border-line-soft bg-surface px-3 py-1">
        {history.length === 0 && <div className="py-[7px] text-xs text-ink-3">아직 없습니다.</div>}
        {history.map((h, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 border-b border-line-soft py-[7px] text-xs last:border-b-0"
          >
            <span className="font-semibold whitespace-nowrap">{h.name}</span>
            <span className="min-w-0 truncate text-ink-2">{h.kindLabel}</span>
            <span
              className={`text-[11px] font-bold whitespace-nowrap ${h.status === 'APPROVED' ? 'text-primary' : 'text-danger'}`}
            >
              {h.status === 'APPROVED' ? '승인' : `반려${h.reason ? ` · ${h.reason}` : ''}`}
            </span>
            <span className="ml-auto whitespace-nowrap text-ink-3">{h.when}</span>
            {h.status === 'APPROVED' && <CancelApproved id={h.id} label={`${h.name} ${h.kindLabel}`} />}
          </div>
        ))}
      </div>
    </>
  )
}

function ApprovalCard({ p, focusHref }: { p: PendingLeave; focusHref: FocusHref }) {
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
      if (decision === 'approve' && p.focus) router.push(focusHref(p.focus))
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

// 3-6: 승인한 휴가를 처리 이력에서 취소한다. 확정된 달은 승인 전 칸으로 되돌린다(근무 조정의 휴가 취소와 같음)
function CancelApproved({ id, label }: { id: string; label: string }) {
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState('')
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={`${label} 승인 취소`}
        className="cursor-pointer rounded-md border border-line px-1.5 text-[11px] whitespace-nowrap text-danger disabled:opacity-50"
        onClick={() => {
          if (
            !window.confirm(`${label} 승인을 취소할까요? 확정된 달이면 근무표 칸도 승인 전으로 돌아갑니다.`)
          )
            return
          start(async () => {
            const r = await cancelApprovedLeaveAction({ leaveId: id })
            setMsg(
              !r.ok
                ? (r.message ?? '취소하지 못했습니다.')
                : 'skipped' in r && r.skipped.length
                  ? `취소했습니다. ${r.skipped.map((x) => x.date.slice(5).replace('-', '/')).join(', ')}은 그사이 바뀌어 되돌리지 않았습니다.`
                  : '승인을 취소했습니다.',
            )
          })
        }}
      >
        승인 취소
      </button>
      {msg && (
        <span role="status" className="basis-full text-[11px] text-ink-2">
          {msg}
        </span>
      )}
    </>
  )
}
