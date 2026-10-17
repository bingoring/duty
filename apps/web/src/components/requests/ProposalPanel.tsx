'use client'

import { useState, useTransition } from 'react'
import { cancelLeaveProposalAction, respondLeaveProposalAction } from '@/server/requests/actions'
import type { ProposalDTO } from '@/server/requests/proposals'

// 3-5: 관리자가 OFF를 휴가로 바꾸자는 요청. 간호사는 수락·거절, 관리자는 답 대기 중인 요청을 취소
export function ProposalPanel({
  admin,
  pending,
  recent,
}: {
  admin: boolean
  pending: ProposalDTO[]
  recent: ProposalDTO[]
}) {
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState('')
  if (pending.length === 0 && recent.length === 0) return null
  const title = admin ? '휴가 변경 요청 · 간호사 답 대기' : '받은 휴가 변경 요청'
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? done : (r.message ?? '처리하지 못했습니다.'))
    })
  const btn =
    'h-7 cursor-pointer rounded-lg px-2.5 text-xs font-semibold disabled:cursor-default disabled:opacity-50'
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-[10px] border border-line bg-[#FFF9E8] px-3 py-2.5 text-[13px]"
    >
      <div className="flex items-center gap-2">
        <b>{title}</b>
        {pending.length > 0 && (
          <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
            {pending.length}
          </span>
        )}
        {!admin && pending.length > 0 && (
          <span className="text-xs text-ink-2">
            수락하면 OFF가 그 휴가로 바뀝니다. 거절하면 그대로입니다.
          </span>
        )}
      </div>
      {pending.map((p) => (
        <div
          key={p.id}
          role="group"
          aria-label={`${p.name} ${p.range} ${p.kindLabel}`}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft bg-surface px-2.5 py-2"
        >
          <span className="font-semibold">{admin ? p.name : `${p.by} → 나`}</span>
          <span>
            {p.range} OFF → <b>{p.kindLabel}</b> · {p.days}일
          </span>
          {p.comment && <span className="text-xs text-ink-2">“{p.comment}”</span>}
          <span className="ml-auto flex gap-1.5">
            {admin ? (
              <button
                type="button"
                disabled={busy}
                className={`${btn} border border-line bg-surface`}
                onClick={() => act(() => cancelLeaveProposalAction(p.id), '요청을 취소했습니다.')}
              >
                요청 취소
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className={`${btn} border border-line bg-surface`}
                  onClick={() =>
                    act(
                      () => respondLeaveProposalAction({ id: p.id, decision: 'reject' }),
                      '거절했습니다. OFF는 그대로입니다.',
                    )
                  }
                >
                  거절
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={`${btn} bg-primary text-white`}
                  onClick={() =>
                    act(
                      () => respondLeaveProposalAction({ id: p.id, decision: 'accept' }),
                      '수락했습니다. 휴가로 바뀌었습니다.',
                    )
                  }
                >
                  수락
                </button>
              </>
            )}
          </span>
        </div>
      ))}
      {recent.length > 0 && (
        <details className="text-xs text-ink-2">
          <summary className="cursor-pointer">최근 처리 {recent.length}건</summary>
          {recent.map((p) => (
            <div key={p.id} className="flex gap-2 py-0.5">
              <span className="font-semibold text-ink">{p.name}</span>
              <span>
                {p.range} {p.kindLabel}
              </span>
              <span className={p.status === 'ACCEPTED' ? 'text-primary' : 'text-danger'}>
                {p.statusLabel}
                {p.closedReason ? ` · ${p.closedReason}` : ''}
              </span>
            </div>
          ))}
        </details>
      )}
      {msg && (
        <div role="status" className="text-xs text-ink-2">
          {msg}
        </div>
      )}
    </section>
  )
}
