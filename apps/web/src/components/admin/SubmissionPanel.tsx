'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { reviewSubmissionAction } from '@/server/onboarding/actions'
import type { PendingSubmission } from '@/server/onboarding/service'

// Build Spec 2-11 R-ONB-7 — 본인 초기 설정에서 바뀐 값: 확인(그대로) 또는 되돌리기(메모 필수)
export function SubmissionPanel({
  items,
  names,
}: {
  items: (Omit<PendingSubmission, 'submittedAt'> & { at: string })[]
  names: Record<string, string>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [revert, setRevert] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!items.length) return null
  const act = (id: string, decision: 'confirmed' | 'reverted') =>
    start(async () => {
      const r = await reviewSubmissionAction({ id, decision, ...(decision === 'reverted' ? { note } : {}) })
      setMsg(
        r.ok
          ? { ok: true, text: decision === 'confirmed' ? '확인했습니다.' : '이전 값으로 되돌렸습니다.' }
          : { ok: false, text: r.message },
      )
      if (r.ok) {
        setRevert(null)
        setNote('')
        router.refresh()
      }
    })
  return (
    <section
      aria-label="본인 입력 확인 필요"
      className="flex flex-col gap-2.5 rounded-xl bg-warn-bg p-3.5 text-[13px]"
    >
      <div className="font-bold">본인 입력 확인 필요 · {items.length}건</div>
      {msg && <div className={msg.ok ? 'text-primary' : 'text-danger'}>{msg.text}</div>}
      {items.map((s) => (
        <article
          key={s.id}
          aria-label={`${names[s.userId] ?? ''} 본인 입력`}
          className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
        >
          <div className="flex items-center justify-between">
            <b>{names[s.userId]}</b>
            <span className="text-[11px] text-ink-3">{s.at}</span>
          </div>
          <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-xs">
            {s.items.map((i) => (
              <div key={i.key} className="contents">
                <dt className="text-ink-2">{i.label}</dt>
                <dd>
                  {i.before} → <b>{i.after}</b>
                </dd>
              </div>
            ))}
          </dl>
          {revert === s.id ? (
            <div className="flex gap-1.5">
              <input
                aria-label="되돌리는 사유"
                placeholder="되돌리는 사유"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-line px-2 text-xs"
              />
              <button
                type="button"
                disabled={pending || !note.trim()}
                onClick={() => act(s.id, 'reverted')}
                className="h-8 cursor-pointer rounded-lg bg-danger px-3 text-xs font-bold text-white disabled:opacity-50"
              >
                되돌리기
              </button>
              <button
                type="button"
                onClick={() => setRevert(null)}
                className="h-8 cursor-pointer rounded-lg border border-line px-2.5 text-xs"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => setRevert(s.id)}
                className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs text-danger"
              >
                되돌리기…
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(s.id, 'confirmed')}
                className="h-8 cursor-pointer rounded-lg bg-primary px-3 text-xs font-bold text-white"
              >
                확인
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
