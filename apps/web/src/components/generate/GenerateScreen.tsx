'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import {
  confirmCandidateAction,
  generateAction,
  revokeConfirmationAction,
  revokePreviewAction,
} from '@/server/generate/actions'
import { saveShiftRequestAction } from '@/server/requests/actions'
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
  // 3-8: 생성안 칸 더블클릭 → 그 간호사의 신청(관리자 입력)으로 저장 → 리롤할지 묻는다
  const [ask, setAsk] = useState<{ userId: string; date: string; name: string } | null>(null)

  const run = () =>
    start(async () => {
      setFailure(null)
      setMessage('')
      const r = await generateAction({ year: view.year, month: view.month, priorities: prio })
      if (r.ok) go(r.candidateId)
      else setFailure({ message: r.message, ...('causes' in r && r.causes ? { causes: r.causes } : {}) })
    })
  const requestFromCell = (code: 'D' | 'E' | 'N' | 'OFF') => {
    if (!ask) return
    const { userId, date, name } = ask
    start(async () => {
      const r = await saveShiftRequestAction({ userId, date, options: [code], comment: '' })
      setAsk(null)
      if (!r.ok) return setFailure({ message: r.message ?? '신청을 저장하지 못했습니다.' })
      const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`
      if (
        window.confirm(
          `${name} ${md} ${code}을(를) 신청 근무로 저장했습니다(관리자 입력).\n이 신청을 반영해 지금 리롤하겠습니까?`,
        )
      )
        run()
      else setMessage(`${name} ${md} ${code} 신청을 저장했습니다. 다시 생성하면 반영됩니다.`)
    })
  }
  // 3-8: 확정 철회 → 생성안 검토로. 사라질 변경을 먼저 보여 준다
  const revoke = () =>
    start(async () => {
      setFailure(null)
      const p = await revokePreviewAction({ year: view.year, month: view.month })
      if (!p.ok) return setFailure({ message: p.message })
      const lost = [
        p.swaps ? `교환 ${p.swaps}건` : '',
        p.adminEdits ? `관리자 수정 ${p.adminEdits}칸` : '',
        p.leaveEdits ? `확정 뒤 휴가 반영 ${p.leaveEdits}칸(휴가 승인은 유지)` : '',
      ].filter(Boolean)
      const ok = window.confirm(
        `${view.month}월 근무표 확정을 철회하고 생성안 검토로 돌아갑니다.\n` +
          (lost.length
            ? `확정 뒤 바뀐 ${lost.join(', ')}이 사라집니다.\n`
            : '확정 뒤 바뀐 근무는 없습니다.\n') +
          '간호사에게는 다시 확정할 때까지 근무표가 보이지 않습니다. 철회할까요?',
      )
      if (!ok) return
      const r = await revokeConfirmationAction({ year: view.year, month: view.month })
      if (r.ok)
        setMessage(`${view.month}월 근무표 확정을 철회했습니다. 다시 생성하거나 안을 골라 확정하세요.`)
      else setFailure({ message: r.message })
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
          <div className="text-xs text-ink-2">
            금지 패턴 {view.forbiddenPatterns.join(' · ')}{' '}
            {view.patternHard ? '자동 차단' : '되도록 피함 (권고)'}
          </div>
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
            {view.planStatus === 'CONFIRMED' && (
              <button
                type="button"
                disabled={pending}
                onClick={revoke}
                className="mt-2 block h-8 cursor-pointer rounded-lg border border-danger bg-surface px-3 text-xs font-semibold text-danger disabled:opacity-50"
              >
                확정 철회 · 다시 생성
              </button>
            )}
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
              {cur.newRequests > 0 && (
                <span className="rounded-full bg-warn-bg px-2 py-0.5 font-semibold text-warn-ink">
                  신청 추가됨 {cur.newRequests}건
                </span>
              )}
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
              빨간 글자·테두리 = 신청 반영 · 파란 테두리 = 관리자 입력 · 누적 off·ⓝN은 이 안으로 정산했을 때
            </span>
          </div>
          {!cur.confirmed && (
            <span className="text-xs text-ink-2">
              칸을 더블클릭하면 그 간호사의 신청(관리자 입력)으로 근무를 정하고 리롤할 수 있습니다.
            </span>
          )}
          {ask && (
            <div
              role="dialog"
              aria-label={`${ask.name} ${ask.date} 신청`}
              className="flex items-center gap-2 rounded-lg border border-ink bg-surface px-3 py-2 text-[13px]"
            >
              <b>
                {ask.name} · {Number(ask.date.slice(5, 7))}/{Number(ask.date.slice(8))}
              </b>
              <span className="text-ink-2">신청 근무로 정하기</span>
              {(['D', 'E', 'N', 'OFF'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={pending}
                  onClick={() => requestFromCell(c)}
                  className="h-8 min-w-10 cursor-pointer rounded-md border border-line bg-surface px-2 font-bold"
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAsk(null)}
                className="ml-auto h-8 cursor-pointer rounded-md border border-line px-2 text-xs"
              >
                닫기
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <ScheduleGrid
              view={cur.grid}
              ui={
                cur.confirmed
                  ? undefined
                  : {
                      onCellDouble: (userId, date) =>
                        setAsk({
                          userId,
                          date,
                          name: cur.grid.rows.find((r) => r.userId === userId)?.name ?? '',
                        }),
                    }
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
