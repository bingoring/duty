'use client'

import {
  applyEdits,
  checkSchedule,
  formatMD,
  formatViolation,
  newViolations,
  replacementCandidates,
  swapEdits,
  weekdayKo,
  type CellEdit,
  type DutyCode,
  type GridCell,
  type Violation,
} from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import {
  cancelApprovedLeaveAction,
  closeMonthAction,
  previewCloseAction,
  reopenMonthAction,
  saveEditsAction,
  updateNegotiationAction,
} from '@/server/adjust/actions'
import type { AdjustView } from '@/server/adjust/view'
import { cellView, type GridCellView } from '@/server/schedule/view'
import { useHydrated } from '../admin/ui'

// S9 근무 조정 · 관리자 시점 (Build Spec 2-7 frontend-components, 핸드오프 1j)
const CHIPS = [
  { code: 'D', cls: 'bg-shift-d' },
  { code: 'E', cls: 'bg-shift-e' },
  { code: 'N', cls: 'bg-shift-n' },
  { code: 'OFF', cls: 'bg-shift-off' },
  { code: 'S', cls: 'bg-shift-s' },
] as const
type Chip = (typeof CHIPS)[number]['code']

const btn2 =
  'h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-[13px] disabled:cursor-default disabled:opacity-50'
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
const withDay = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`
const key = (u: string, d: string) => `${u}|${d}`
// 'D로'·'N으로' (엔 = 받침 ㄴ)
const ro = (code: string) => `${code}${code === 'N' ? '으로' : '로'}`
const isLeaveCell = (c: GridCell) =>
  c.code === 'AL' || c.code === 'LEAVE' || c.offKind === 'special' || c.offKind === 'founding'
const codeLabel = (c: GridCell | undefined) =>
  !c
    ? '—'
    : c.code === 'OFF'
      ? c.offKind === 'sleeping'
        ? '슬리핑 OFF'
        : 'OFF'
      : isLeaveCell(c)
        ? '휴'
        : c.code

type Popover =
  | { kind: 'cell'; userId: string; date: string; x: number; y: number }
  | { kind: 'replace'; date: string; shift: DutyCode }

export function AdjustScreen({ view }: { view: AdjustView }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, start] = useTransition()
  const [edits, setEdits] = useState<CellEdit[]>([])
  const [pop, setPop] = useState<Popover | null>(
    view.focus?.shift ? { kind: 'replace', date: view.focus.date, shift: view.focus.shift } : null,
  )
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; list?: string[] } | null>(null)
  const [closing, setClosing] = useState(false)
  const input = view.checkInput
  const nameOf = (id: string) => view.names[id]?.name ?? id
  const base = useMemo(() => (input ? applyEdits(input.cells, edits) : []), [input, edits])

  // 저장 전 편집이 있으면 떠날 때 경고
  useEffect(() => {
    if (!edits.length) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [edits.length])

  const pendingViews = useMemo(() => {
    const m = new Map<string, GridCellView>()
    const days = new Map(view.grid.days.map((d) => [d.date, d]))
    for (const c of applyEdits(input?.cells ?? [], edits).filter((c) =>
      edits.some((e) => e.userId === c.userId && e.date === c.date),
    ))
      m.set(key(c.userId, c.date), cellView({ ...c, source: 'admin' }, days.get(c.date)!))
    return m
  }, [edits, input, view.grid.days])

  const addEdits = (next: CellEdit[]) => {
    const orig = new Map((input?.cells ?? []).map((c) => [key(c.userId, c.date), c]))
    setEdits((prev) => {
      const m = new Map(prev.map((e) => [key(e.userId, e.date), e]))
      for (const e of next) {
        const k = key(e.userId, e.date)
        const o = orig.get(k)!
        const first = m.get(k)?.before ?? e.before
        const back =
          o.code === e.after.code &&
          (o.code !== 'OFF' || (o.offKind ?? 'regular') === (e.after.offKind ?? 'regular'))
        if (back) m.delete(k)
        else m.set(k, { ...e, before: first })
      }
      return [...m.values()]
    })
    setPop(null)
  }

  const save = () =>
    start(async () => {
      if (!view.plan) return
      const r = await saveEditsAction({ planId: view.plan.id, edits })
      if (r.ok) {
        setEdits([])
        setMsg({
          kind: 'ok',
          text: `${'saved' in r ? r.saved : 0}건을 저장했습니다. 간호사 근무표에 바로 보입니다.`,
        })
      } else {
        const list = 'violations' in r ? (r.violations as string[] | undefined) : undefined
        setMsg({ kind: 'err', text: r.message, ...(list ? { list } : {}) })
      }
    })

  const go = (ym: string) => {
    if (edits.length && !window.confirm(`저장하지 않은 변경 ${edits.length}건이 사라집니다. 이동할까요?`))
      return
    router.push(`/adjust?ym=${ym}`)
  }

  return (
    <div
      data-hydrated={hydrated || undefined}
      className="relative flex min-w-0 flex-col gap-3 px-4 py-[18px]"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => go(view.grid.prev)}
            className="h-7 w-7 cursor-pointer rounded-[7px] border border-line bg-surface text-sm"
          >
            ‹
          </button>
          <h1 className="text-[20px] font-bold tracking-[-0.02em] whitespace-nowrap">
            {view.year}년 {view.month}월 · 근무 조정
          </h1>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => go(view.grid.next)}
            className="h-7 w-7 cursor-pointer rounded-[7px] border border-line bg-surface text-sm"
          >
            ›
          </button>
        </div>
        {view.admin && view.plan && <NegotiationEditor view={view} />}
        {view.admin && (
          <span className="text-xs whitespace-nowrap text-ink-2">
            신청 마감 <b className="text-ink">매월 {view.requestDeadlineDay}일</b> ·{' '}
            <Link href="/admin/rules" className="underline">
              설정
            </Link>
          </span>
        )}
        <span className="ml-auto" />
        {view.editable && (
          <>
            <span className="text-[13px] whitespace-nowrap text-ink-2">변경 {edits.length}건 미저장</span>
            <button
              type="button"
              className={btn2}
              disabled={!edits.length || pending}
              onClick={() => setEdits([])}
            >
              되돌리기
            </button>
            <button
              type="button"
              disabled={!edits.length || pending}
              onClick={save}
              className="h-8 cursor-pointer rounded-lg bg-primary px-3.5 text-[13px] font-bold whitespace-nowrap text-white disabled:cursor-default disabled:opacity-50"
            >
              저장 · 재배포
            </button>
          </>
        )}
        {view.admin &&
          view.close &&
          view.plan &&
          (view.plan.status === 'CLOSED' ? (
            <button
              type="button"
              className={btn2}
              disabled={!view.close.canReopen || pending}
              title={view.close.reopenReason ?? ''}
              onClick={() => {
                if (
                  !window.confirm(
                    `${view.month}월 마감을 취소합니다. 정산 기록을 되돌리고 다시 수정할 수 있게 됩니다.`,
                  )
                )
                  return
                start(async () => {
                  const r = await reopenMonthAction({ planId: view.plan!.id })
                  setMsg(
                    r.ok ? { kind: 'ok', text: '마감을 취소했습니다.' } : { kind: 'err', text: r.message },
                  )
                })
              }}
            >
              마감 취소
            </button>
          ) : (
            <button
              type="button"
              className={btn2}
              disabled={!view.close.can || !!edits.length || pending}
              title={edits.length ? '저장하지 않은 변경이 있습니다' : (view.close.reason ?? '')}
              onClick={() => setClosing(true)}
            >
              월 마감
            </button>
          ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded shadow-[inset_0_0_0_1.5px_var(--color-danger)]" />
          신청 (OFF·D·E·N 모두)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded shadow-[inset_0_0_0_2px_var(--color-admin)]" />
          관리자 수정
        </span>
        {view.editable && (
          <span>칸을 누르면 편집합니다 · 변경은 모았다가 「저장 · 재배포」로 한 번에 반영됩니다</span>
        )}
      </div>

      {view.blockedReason && view.plan?.status !== 'CONFIRMED' && (
        <div className="rounded-lg bg-panel px-3 py-2 text-xs text-ink-2">
          {view.blockedReason}{' '}
          {(view.plan?.status === 'DRAFTING' || !view.plan) && (
            <Link href={`/admin/generate?ym=${view.ym}`} className="font-semibold underline">
              듀티 생성으로
            </Link>
          )}
        </div>
      )}
      {!view.admin && (
        <div className="rounded-lg bg-panel px-3 py-2 text-xs text-ink-2">
          근무 교환 요청 기능은 준비 중입니다. 지금은 확정된 근무표를 볼 수 있습니다.
        </div>
      )}
      {msg && (
        <div
          role={msg.kind === 'err' ? 'alert' : 'status'}
          className={`rounded-lg px-3 py-2 text-[13px] ${msg.kind === 'err' ? 'bg-danger-bg text-danger-ink' : 'bg-primary-soft text-primary-hover'}`}
        >
          {msg.text}
          {msg.list && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {msg.list.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ScheduleGrid
        view={view.grid}
        ui={
          view.editable
            ? {
                pending: pendingViews,
                focusDate: pop?.kind === 'replace' ? pop.date : null,
                onCell: (userId, date, el) => {
                  const r = el.getBoundingClientRect()
                  const x = Math.min(window.innerWidth - 320, Math.max(8, r.left - 140))
                  const y =
                    r.bottom + 6 + window.scrollY > window.innerHeight + window.scrollY - 360
                      ? r.top + window.scrollY - 370
                      : r.bottom + window.scrollY + 6
                  setPop({ kind: 'cell', userId, date, x, y })
                },
              }
            : undefined
        }
      />

      {pop?.kind === 'cell' && input && (
        <CellPopover
          key={key(pop.userId, pop.date)}
          view={view}
          base={base}
          userId={pop.userId}
          date={pop.date}
          style={{ left: pop.x, top: pop.y }}
          nameOf={nameOf}
          onClose={() => setPop(null)}
          onApply={addEdits}
          onLeaveCancelled={(text, list) => {
            setPop(null)
            setMsg({ kind: 'ok', text, ...(list.length ? { list } : {}) })
            router.refresh()
          }}
        />
      )}
      {pop?.kind === 'replace' && input && (
        <ReplacementPopover
          view={view}
          base={base}
          date={pop.date}
          shift={pop.shift}
          nameOf={nameOf}
          onClose={() => setPop(null)}
          onApply={addEdits}
        />
      )}
      {closing && view.plan && (
        <CloseDialog
          month={view.month}
          planId={view.plan.id}
          onClose={() => setClosing(false)}
          onDone={(text) => {
            setClosing(false)
            setMsg({ kind: 'ok', text })
          }}
        />
      )}
    </div>
  )
}

function NegotiationEditor({ view }: { view: AdjustView }) {
  const p = view.plan!
  const year = p.negotiationStart.slice(0, 4)
  const [start, setStart] = useState(md(p.negotiationStart))
  const [end, setEnd] = useState(md(p.negotiationEnd))
  const [err, setErr] = useState('')
  const [pending, run] = useTransition()
  const toIso = (v: string) => {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(v.trim())
    return m ? `${year}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : ''
  }
  const changed = start !== md(p.negotiationStart) || end !== md(p.negotiationEnd)
  const input = (v: string, set: (s: string) => void, orig: string, label: string) => (
    <input
      aria-label={label}
      value={v}
      onChange={(e) => (set(e.target.value), setErr(''))}
      className={`h-6 w-[46px] rounded-md border text-center text-xs ${v !== orig ? 'border-admin' : 'border-line'}`}
    />
  )
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-[3px] pr-1 pl-2.5 text-xs"
      title={err}
    >
      <span className="text-ink-2">협의 수정 기간</span>
      {input(start, setStart, md(p.negotiationStart), '협의 시작')}
      <span className="text-ink-2">–</span>
      {input(end, setEnd, md(p.negotiationEnd), '협의 끝')}
      <button
        type="button"
        disabled={!changed || pending || !view.admin}
        onClick={() =>
          run(async () => {
            const r = await updateNegotiationAction({ planId: p.id, start: toIso(start), end: toIso(end) })
            if (!r.ok) setErr(r.message)
          })
        }
        className="h-6 cursor-pointer rounded-md bg-ink px-2 text-[11px] font-semibold text-white disabled:cursor-default disabled:opacity-40"
      >
        변경
      </button>
      {err && (
        <span role="alert" className="text-danger">
          {err}
        </span>
      )}
    </div>
  )
}

function violationText(v: Violation, nameOf: (id: string) => string, month: number) {
  const f = formatViolation(v, { nameOf, month })
  return f.detail ? `${f.title} · ${f.detail}` : f.title
}

function CellPopover(props: {
  view: AdjustView
  base: GridCell[]
  userId: string
  date: string
  style: React.CSSProperties
  nameOf: (id: string) => string
  onClose: () => void
  onApply: (e: CellEdit[]) => void
  onLeaveCancelled: (text: string, list: string[]) => void
}) {
  const { view, base, userId, date, nameOf } = props
  const input = view.checkInput!
  const cur = base.find((c) => c.userId === userId && c.date === date)
  const [pick, setPick] = useState<Chip | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, run] = useTransition()
  const leave = view.leaveCells[key(userId, date)]
  const req = view.requests[key(userId, date)]

  const unchanged =
    !!cur && cur.code === pick && (pick !== 'OFF' || (cur.offKind === 'sleeping') === sleeping)
  const trialEdit: CellEdit | null =
    cur && pick && !unchanged
      ? {
          userId,
          date,
          before: {
            code: cur.code,
            ...(cur.offKind ? { offKind: cur.offKind } : {}),
            ...(cur.leaveKind ? { leaveKind: cur.leaveKind } : {}),
          },
          after:
            pick === 'OFF' ? { code: 'OFF', offKind: sleeping ? 'sleeping' : 'regular' } : { code: pick },
          kind: 'manual',
        }
      : null
  const diff = useMemo(() => {
    if (!trialEdit) return null
    const before = checkSchedule({ ...input, cells: base })
    const trialCells = applyEdits(base, [trialEdit])
    return { d: newViolations(before, checkSchedule({ ...input, cells: trialCells })), trialCells }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, sleeping, base])
  const hard = diff?.d.hardViolations ?? []
  const staffing = hard.filter(
    (v) => (v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS') && v.dates[0] === date,
  )
  const others = hard.filter((v) => !staffing.includes(v))
  const shortShift = (staffing[0]?.shift ?? null) as DutyCode | null
  const candidate = useMemo(() => {
    if (!diff || !shortShift) return null
    return (
      replacementCandidates({ ...input, cells: diff.trialCells }, date, shortShift).find(
        (c) => c.newHard.length === 0 && c.userId !== userId,
      ) ?? null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, shortShift])
  const swap = candidate ? swapEdits(base, date, userId, candidate.userId) : null

  return (
    <div
      role="dialog"
      aria-label={`${nameOf(userId)} ${md(date)} 근무 편집`}
      style={props.style}
      className="absolute z-20 flex w-[300px] flex-col gap-2.5 rounded-xl border border-ink bg-surface p-3.5 text-[13px] shadow-[0_16px_40px_rgba(0,0,0,.18)]"
      onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold">
          {nameOf(userId)} · {withDay(date)}
        </span>
        <span className="flex items-center gap-2 text-ink-2">
          현재 <b className="text-ink">{codeLabel(cur)}</b>
          <button
            type="button"
            aria-label="닫기"
            className="cursor-pointer text-ink-3"
            onClick={props.onClose}
          >
            ✕
          </button>
        </span>
      </div>
      {cur && isLeaveCell(cur) ? (
        <>
          <div className="text-xs text-ink-2">
            {leave ? `${leave.kindLabel} · ${leave.range}` : '휴가 칸 (근무표 생성 때 들어감)'}
          </div>
          {leave && (
            <button
              type="button"
              disabled={pending}
              className="h-8 cursor-pointer self-end rounded-lg border border-danger px-3 text-xs text-danger"
              onClick={() => {
                if (
                  !window.confirm(
                    `${nameOf(userId)} ${leave.kindLabel}(${leave.range})를 취소하고 칸을 승인 전으로 되돌립니다.`,
                  )
                )
                  return
                run(async () => {
                  const r = await cancelApprovedLeaveAction({ leaveId: leave.leaveId })
                  if (!r.ok) return props.onLeaveCancelled(r.message, [])
                  const rr = r as { restored: string[]; skipped: { reason: string }[] }
                  props.onLeaveCancelled(
                    `휴가를 취소했습니다. ${rr.restored.length}일을 되돌렸습니다.`,
                    rr.skipped.map((s) => s.reason),
                  )
                })
              }}
            >
              휴가 취소
            </button>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            {CHIPS.map((c) => {
              const isCur = cur?.code === c.code
              return (
                <button
                  key={c.code}
                  type="button"
                  aria-pressed={pick === c.code}
                  onClick={() => (setPick(c.code), setReason(''))}
                  className={`h-9 cursor-pointer rounded-lg border-2 font-bold text-ink ${c.cls} ${
                    pick === c.code ? 'border-ink' : isCur ? 'border-admin' : 'border-transparent'
                  }`}
                >
                  {c.code}
                </button>
              )
            })}
          </div>
          {pick === 'OFF' && (
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={sleeping} onChange={(e) => setSleeping(e.target.checked)} />
              슬리핑오프로
            </label>
          )}
          {req && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
              신청: <b className="text-ink">{req.label}</b>
              {req.comment && (
                <>
                  · 코멘트 <span className="text-ink">&ldquo;{req.comment}&rdquo;</span>
                </>
              )}
            </div>
          )}
          {others.length > 0 && (
            <div className="rounded-lg bg-danger-bg px-2.5 py-2 text-xs leading-[1.5] text-danger-ink">
              <b>{ro(pick ?? '')} 변경 불가</b> ·{' '}
              {others.map((v) => violationText(v, nameOf, view.month)).join(' · ')}
            </div>
          )}
          {staffing.length > 0 && (
            <div className="rounded-lg bg-panel px-2.5 py-2 text-xs leading-[1.5] text-ink-2">
              {ro(pick ?? '')} 변경 시 {staffing.map((v) => violationText(v, nameOf, view.month)).join(' · ')}
              . <b className="text-ink">최소 인원 미달</b>
              {candidate
                ? `, 대체자 필요: ${nameOf(candidate.userId)} (OFF${candidate.kTass ? ', K-tass' : ''})`
                : ', 그날 쉬는 사람 중 대체할 수 있는 사람이 없습니다'}
            </div>
          )}
          {diff && diff.d.softWarnings.length > 0 && (
            <div className="text-xs text-warn-ink">
              권고 · {diff.d.softWarnings.map((v) => violationText(v, nameOf, view.month)).join(' · ')}
            </div>
          )}
          {hard.length > 0 && (
            <textarea
              aria-label="예외 사유"
              placeholder="사유 (필수 규칙을 어기고 적용하는 이유)"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-14 rounded-lg border border-line p-2 text-xs"
            />
          )}
          <div className="flex justify-end gap-1.5">
            {swap && (
              <button
                type="button"
                className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs"
                onClick={() => props.onApply(swap)}
              >
                {nameOf(candidate!.userId)}과 맞바꾸기
              </button>
            )}
            {hard.length > 0 ? (
              <button
                type="button"
                disabled={!reason.trim()}
                onClick={() =>
                  trialEdit && props.onApply([{ ...trialEdit, override: { reason: reason.trim() } }])
                }
                className="h-8 cursor-pointer rounded-lg bg-danger px-3 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-40"
              >
                그래도 적용
              </button>
            ) : (
              <button
                type="button"
                disabled={!trialEdit}
                onClick={() => trialEdit && props.onApply([trialEdit])}
                className="h-8 cursor-pointer rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-40"
              >
                적용
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ReplacementPopover(props: {
  view: AdjustView
  base: GridCell[]
  date: string
  shift: DutyCode
  nameOf: (id: string) => string
  onClose: () => void
  onApply: (e: CellEdit[]) => void
}) {
  const { view, base, date, shift, nameOf } = props
  const input = view.checkInput!
  const check = useMemo(() => checkSchedule({ ...input, cells: base }), [input, base])
  const short = check.hardViolations.filter(
    (v) => (v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS') && v.dates[0] === date && v.shift === shift,
  )
  const list = useMemo(
    () => replacementCandidates({ ...input, cells: base }, date, shift),
    [input, base, date, shift],
  )
  return (
    <div
      role="dialog"
      aria-label={`${md(date)} ${shift} 대체 지정`}
      className="absolute top-16 right-4 z-20 flex w-[300px] flex-col gap-2.5 rounded-xl border border-ink bg-surface p-3.5 text-[13px] shadow-[0_16px_40px_rgba(0,0,0,.18)]"
    >
      <div className="flex items-center justify-between">
        <span className="font-bold">
          {withDay(date)} {shift} 대체 지정
        </span>
        <button type="button" aria-label="닫기" className="cursor-pointer text-ink-3" onClick={props.onClose}>
          ✕
        </button>
      </div>
      <div
        className={`rounded-lg px-2.5 py-2 text-xs ${short.length ? 'bg-danger-bg text-danger-ink' : 'bg-primary-soft text-primary-hover'}`}
      >
        {short.length
          ? short.map((v) => violationText(v, nameOf, view.month)).join(' · ')
          : '인원이 채워졌습니다'}
      </div>
      {list.length === 0 && <div className="text-xs text-ink-3">그날 쉬는 교대 근무자가 없습니다.</div>}
      {list.map((c) => (
        <div
          key={c.userId}
          className={`flex items-center gap-2 text-xs ${c.newHard.length ? 'opacity-50' : ''}`}
        >
          <span className="font-semibold">{nameOf(c.userId)}</span>
          <span className="text-ink-2">OFF{c.kTass ? ', K-tass' : ''}</span>
          {c.newHard.length > 0 && (
            <span className="truncate text-danger">{violationText(c.newHard[0]!, nameOf, view.month)}</span>
          )}
          <button
            type="button"
            disabled={c.newHard.length > 0}
            onClick={() => props.onApply([c.edit])}
            className="ml-auto h-7 cursor-pointer rounded-md bg-ink px-2.5 text-[11px] font-semibold text-white disabled:cursor-default disabled:opacity-40"
          >
            지정
          </button>
        </div>
      ))}
    </div>
  )
}

type PreviewRow = {
  userId: string
  name: string
  actualOff: number
  baselineOff: number
  offCarryBefore: number
  offCarryAfter: number
  nightCount: number
  sleepingOff: number
  nightBankBefore: number
  nightBankAfter: number
}
const signedN = (n: number) => (n > 0 ? `+${n}` : String(n))

function CloseDialog(props: {
  month: number
  planId: string
  onClose: () => void
  onDone: (text: string) => void
}) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [err, setErr] = useState('')
  const [pending, run] = useTransition()
  useEffect(() => {
    let alive = true
    void previewCloseAction({ planId: props.planId }).then((r) => {
      if (!alive) return
      if ('rows' in r) setRows(r.rows)
      else setErr(r.message)
    })
    return () => {
      alive = false
    }
  }, [props.planId])
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
      <div
        role="dialog"
        aria-label={`${props.month}월 마감`}
        className="flex w-[560px] flex-col gap-3 rounded-xl bg-surface p-5 text-[13px]"
      >
        <div className="text-[16px] font-bold">{props.month}월 마감</div>
        {!rows && !err && <div className="text-ink-2">정산 결과를 계산하는 중…</div>}
        {rows && (
          <div role="table" aria-label="정산 미리보기" className="text-xs">
            <div
              role="row"
              className="grid grid-cols-[1.2fr_1fr_1.3fr_.6fr_.7fr_1.2fr] border-b border-line pb-1 text-ink-2"
            >
              {['성명', '실제/기준 OFF', '누적 OFF 전→후', 'N', '슬리핑', '잔여 N 전→후'].map((h) => (
                <span role="columnheader" key={h}>
                  {h}
                </span>
              ))}
            </div>
            {rows.map((r) => (
              <div
                role="row"
                key={r.userId}
                className="grid grid-cols-[1.2fr_1fr_1.3fr_.6fr_.7fr_1.2fr] border-b border-line-soft py-1"
              >
                <span role="cell" className="font-semibold">
                  {r.name}
                </span>
                <span role="cell">
                  {r.actualOff}/{r.baselineOff}
                </span>
                <span role="cell">
                  {signedN(r.offCarryBefore)} → <b>{signedN(r.offCarryAfter)}</b>
                </span>
                <span role="cell">{r.nightCount}</span>
                <span role="cell">{r.sleepingOff}</span>
                <span role="cell">
                  {r.nightBankBefore} → <b>{r.nightBankAfter}</b>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-ink-2">
          마감하면 정산이 원장에 기록되고 이 달의 칸을 고칠 수 없습니다(마감 취소로 되돌릴 수 있습니다).
        </div>
        {err && (
          <div role="alert" className="text-danger">
            {err}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn2} onClick={props.onClose}>
            취소
          </button>
          <button
            type="button"
            disabled={!rows || pending}
            onClick={() =>
              run(async () => {
                const r = await closeMonthAction({ planId: props.planId })
                if (r.ok) props.onDone(`${props.month}월을 마감했습니다.`)
                else setErr(r.message)
              })
            }
            className="h-8 cursor-pointer rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            마감
          </button>
        </div>
      </div>
    </div>
  )
}
