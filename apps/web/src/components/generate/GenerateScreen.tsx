'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { confirmCandidateAction, generateAction } from '@/server/generate/actions'
import type { Priorities } from '@/server/generate/input'
import type { GenerateView } from '@/server/generate/view'
import { useHydrated } from '../admin/ui'

// S8 관리자 · 듀티 생성·리롤 (Build Spec 2-6 frontend-components, 핸드오프 1i + 생성안 격자 Q2)
type Failure = { message: string; causes?: string[] }

// 1i처럼 짧게: 통과 항목 + 앞쪽 미충족만, 나머지는 펼쳐 본다
const CHECKS_SHOWN = 6
const card = 'flex flex-col rounded-xl border border-line bg-surface p-4 text-[13px]'
const dot = (ok: boolean) => `mt-1.5 h-2 w-2 flex-none rounded-full ${ok ? 'bg-primary' : 'bg-warn-dot'}`

export function GenerateScreen({ view }: { view: GenerateView }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, start] = useTransition()
  const [failure, setFailure] = useState<Failure | null>(null)
  const [message, setMessage] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [prio, setPrio] = useState<Priorities>(() => {
    const on = (k: string) => view.priorities.find((p) => p.key === k)?.checked ?? true
    return {
      requests: on('requests'),
      offAfterNight: on('offAfterNight'),
      weekendPair: on('weekendPair'),
      avoidJuniorOnly: on('avoidJuniorOnly'),
      minimizeRepeatPairs: on('minimizeRepeatPairs'),
    }
  })
  const cur = view.current
  const confirmed = view.planStatus === 'CONFIRMED' || view.planStatus === 'CLOSED'
  const idx = cur ? view.candidates.findIndex((c) => c.id === cur.id) : -1
  const allChecks = cur
    ? [
        ...cur.checks.slice(0, 2),
        ...cur.offShort.map((o) => ({
          ok: false,
          title: `${o.name} · 목표보다 OFF ${o.short}개 적음`,
          detail: '인원이 모자란 달이라 누적 OFF가 음수로 다음 달에 이월됩니다',
        })),
        ...cur.checks.slice(2),
      ]
    : []
  const shownChecks = showAll ? allChecks : allChecks.slice(0, CHECKS_SHOWN)
  const go = (id: string) => router.replace(`/admin/generate?ym=${view.ym}&c=${id}`)

  const run = () =>
    start(async () => {
      setFailure(null)
      setMessage('')
      const r = await generateAction({ year: view.year, month: view.month, priorities: prio })
      if (r.ok) go(r.candidateId)
      else setFailure({ message: r.message, ...('causes' in r && r.causes ? { causes: r.causes } : {}) })
    })
  const confirm = () => {
    if (!cur) return
    if (
      !window.confirm(
        `${view.month}월 근무표를 ${cur.no}번째 안으로 확정합니다. 확정하면 간호사에게 공개됩니다.`,
      )
    )
      return
    start(async () => {
      const r = await confirmCandidateAction({ candidateId: cur.id })
      if (r.ok) setMessage(`${view.month}월 근무표를 확정했습니다.`)
      else setFailure({ message: r.message })
    })
  }

  const secondary =
    'h-[46px] flex-1 cursor-pointer rounded-[10px] border border-line bg-surface text-sm font-semibold disabled:cursor-default disabled:opacity-50'
  const primary =
    'h-[46px] flex-[1.4] cursor-pointer rounded-[10px] bg-primary text-sm font-bold text-white disabled:cursor-default disabled:opacity-50'

  return (
    <div
      data-hydrated={hydrated || undefined}
      className="grid min-w-0 grid-cols-[320px_minmax(0,1fr)] gap-5 px-7 py-6"
    >
      <aside className="flex flex-col gap-3">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{view.month}월 듀티 생성</h1>
        <div className={`${card} gap-3`}>
          <div className="font-bold">필수 조건</div>
          {view.hard.map((h) => (
            <div key={h.label} className="flex items-center justify-between">
              <span>{h.label}</span>
              <span className="rounded-md border border-line px-2.5 py-1 font-semibold">{h.value}</span>
            </div>
          ))}
          <div className="text-xs text-ink-2">금지 패턴 {view.forbiddenPatterns.join(' · ')} 자동 차단</div>
        </div>
        <div className={`${card} gap-2.5`}>
          <div className="font-bold">우선 반영</div>
          {view.priorities.map((p) => (
            <label key={p.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary"
                disabled={p.disabled || confirmed}
                checked={p.key === 'training' ? true : prio[p.key]}
                onChange={(e) => p.key !== 'training' && setPrio({ ...prio, [p.key]: e.target.checked })}
              />
              {p.label}
            </label>
          ))}
        </div>
        {confirmed ? (
          <div className="rounded-[10px] border border-line bg-primary-soft p-3 text-[13px] text-primary-hover">
            {view.month}월 근무표를 확정했습니다 ·{' '}
            <Link href={`/?ym=${view.ym}`} className="font-bold underline">
              근무표 보기 →
            </Link>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                className={secondary}
                disabled={!view.canGenerate || pending}
                onClick={run}
              >
                {pending ? '생성 중… (최대 20초)' : view.candidates.length ? '↻ 리롤' : '생성'}
              </button>
              <button
                type="button"
                className={primary}
                disabled={!cur || cur.stale || cur.hardCount > 0 || pending}
                onClick={confirm}
              >
                이 안으로 확정
              </button>
            </div>
            {view.blockedReason && <div className="text-xs text-ink-2">{view.blockedReason}</div>}
          </>
        )}
        {message && (
          <div role="status" className="text-[13px] text-primary">
            {message}
          </div>
        )}
      </aside>

      <section role="region" aria-label="생성 결과" className="flex min-w-0 flex-col gap-3">
        {failure && (
          <div role="alert" className="rounded-xl bg-danger-bg p-3.5 text-[13px] text-danger-ink">
            <b>{failure.causes ? '해를 찾지 못했습니다' : failure.message}</b>
            {failure.causes && (
              <>
                <div className="mt-1">{failure.message}</div>
                <ul className="mt-1.5 list-disc pl-5">
                  {failure.causes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="mt-1.5 text-xs">
                  조건을 바꾸거나 근무 신청 화면에서 휴가·신청을 확인하세요.
                </div>
              </>
            )}
          </div>
        )}
        {!cur ? (
          !failure && (
            <div className="rounded-xl border border-line bg-surface p-6 text-[13px] text-ink-2">
              아직 생성한 안이 없습니다. 조건을 확인하고 「생성」을 누르세요.
            </div>
          )
        ) : (
          <>
            <div className="flex items-center gap-2.5 text-[13px]">
              <button
                type="button"
                aria-label="이전 안"
                disabled={idx <= 0}
                onClick={() => go(view.candidates[idx - 1]!.id)}
                className="h-7 w-7 cursor-pointer rounded-[7px] border border-line bg-surface disabled:cursor-default disabled:opacity-40"
              >
                ‹
              </button>
              <span className="text-[15px] font-bold">
                생성 결과 · {cur.no}번째 안{cur.confirmed ? ' (확정)' : ''}
              </span>
              <button
                type="button"
                aria-label="다음 안"
                disabled={idx < 0 || idx >= view.candidates.length - 1}
                onClick={() => go(view.candidates[idx + 1]!.id)}
                className="h-7 w-7 cursor-pointer rounded-[7px] border border-line bg-surface disabled:cursor-default disabled:opacity-40"
              >
                ›
              </button>
              <span className="text-ink-2">{cur.createdAt} 생성</span>
              {cur.stale && <span className="font-semibold text-danger">입력이 바뀜 · 다시 생성 필요</span>}
              <span className="ml-auto rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary">
                필수 규칙 위반 {cur.hardCount}
              </span>
              <span className="rounded-full bg-warn-bg px-2.5 py-1 font-semibold text-warn-ink">
                권고 미충족 {cur.softCount}
              </span>
            </div>
            {!cur.prevMonthConfirmed && (
              <div className="rounded-lg bg-panel px-3 py-2 text-xs text-ink-2">
                전월 근무표가 확정되지 않아 월 경계 규칙(연속 N·금지 패턴)을 확인하지 못했습니다.
              </div>
            )}
            <div role="list" className={`${card} gap-2 p-3.5`}>
              {shownChecks.map((c, i, all) => (
                <div
                  role="listitem"
                  key={`${c.title}-${i}`}
                  className={`flex items-start gap-2.5 py-2 ${i < all.length - 1 ? 'border-b border-line-soft' : ''}`}
                >
                  <span className={dot(c.ok)} />
                  <div>
                    <b>{c.title}</b>
                    {c.detail && <div className="text-ink-2">{c.detail}</div>}
                  </div>
                </div>
              ))}
              {allChecks.length > CHECKS_SHOWN && (
                <button
                  type="button"
                  className="cursor-pointer self-start text-xs font-semibold text-ink-2 underline"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? '접기' : `권고 미충족 ${allChecks.length - CHECKS_SHOWN}건 더 보기`}
                </button>
              )}
            </div>
            <div className={`${card} gap-2.5 p-3.5`}>
              <div className="font-bold">간호사별 배정 요약</div>
              <div role="table" aria-label="간호사별 배정 요약">
                <div role="row" className="grid grid-cols-[1.2fr_repeat(6,1fr)] px-1 text-xs text-ink-2">
                  {['성명', 'D', 'E', 'N', 'OFF', '누적 OFF 후', '잔여 N 후'].map((h) => (
                    <span role="columnheader" key={h}>
                      {h}
                    </span>
                  ))}
                </div>
                {cur.summary.map((s) => (
                  <div
                    role="row"
                    key={s.userId}
                    className="grid grid-cols-[1.2fr_repeat(6,1fr)] border-t border-line-soft px-1 py-1.5 text-[13px]"
                  >
                    <span role="cell" className="font-semibold">
                      {s.name}
                    </span>
                    <span role="cell">{s.D}</span>
                    <span role="cell">{s.E}</span>
                    <span role="cell">{s.N}</span>
                    <span role="cell">{s.OFF}</span>
                    <span
                      role="cell"
                      className={`font-bold ${s.accSign < 0 ? 'text-danger' : s.accSign > 0 ? 'text-primary' : ''}`}
                    >
                      {s.acc}
                    </span>
                    <span role="cell">{s.nLeft}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {cur && (
        <div className="col-span-2 flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3 text-[13px]">
            <span className="font-bold">생성안 격자</span>
            <span className="text-xs text-ink-2">
              빨간 외곽선 = 신청 반영 · 주황 점 = 권고 미충족 칸 · 누적 off·ⓝN은 이 안으로 정산했을 때
            </span>
          </div>
          <div className="overflow-x-auto">
            <ScheduleGrid view={cur.grid} />
          </div>
        </div>
      )}
    </div>
  )
}
