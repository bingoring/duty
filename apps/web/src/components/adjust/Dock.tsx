'use client'

import {
  applyEdits,
  checkSchedule,
  dayCounts,
  formatMD,
  formatViolation,
  monthCarry,
  newViolations,
  replacementCandidates,
  restHoursBetween,
  swapEdits,
  weekdayKo,
  type CellEdit,
  type DutyCode,
  type GridCell,
  type ScheduleInput,
  type Violation,
} from '@duty/domain'
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { cancelApprovedLeaveAction } from '@/server/adjust/actions'
import type { AdjustView } from '@/server/adjust/view'

// 핸드오프 v5 5a·5b — 근무 조정 하단 편집 도크 (AWS 콘솔식 패널)
export type DockTarget =
  { kind: 'cell'; userId: string; date: string } | { kind: 'replace'; date: string; shift: DutyCode }
export type DockMode = 'open' | 'min' | 'max'

const BODY_MIN = 84
const BODY_DEFAULT = 96
const HEIGHT_KEY = 'duty.adjustDock.height'
const CHIPS = [
  { code: 'D', cls: 'bg-shift-d' },
  { code: 'E', cls: 'bg-shift-e' },
  { code: 'N', cls: 'bg-shift-n' },
  { code: 'OFF', cls: 'bg-shift-off' },
  { code: 'S', cls: 'bg-shift-s' },
] as const
type Chip = (typeof CHIPS)[number]['code']

const key = (u: string, d: string) => `${u}|${d}`
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
const withDay = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`
const ro = (code: string) => `${code}${code === 'N' ? '으로' : '로'}`
const isLeaveCell = (c: GridCell) =>
  c.code === 'AL' || c.code === 'LEAVE' || c.offKind === 'special' || c.offKind === 'founding'
export const cellLabel = (c: GridCell | undefined) =>
  !c
    ? '—'
    : c.code === 'OFF'
      ? c.offKind === 'sleeping'
        ? '슬리핑 off'
        : 'off'
      : isLeaveCell(c)
        ? '휴'
        : c.code
const shiftDate = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
// 도크에 대상이 이미 보이므로 그 사람 이름 머리("강도윤 · ")는 뗀다 (v5: "E-S 금지 패턴 (10/13 E → 10/14 S)")
const vText = (v: Violation, nameOf: (id: string) => string, month: number, self?: string) => {
  const f = formatViolation(v, { nameOf, month })
  const prefix = self ? `${nameOf(self)} · ` : ''
  const title = prefix && f.title.startsWith(prefix) ? f.title.slice(prefix.length) : f.title
  return f.detail ? `${title} (${f.detail})` : title
}
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const dotCls = { ok: 'bg-primary', warn: 'bg-warn-dot', bad: 'bg-danger', idle: 'bg-ink-4' }

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function readHeight() {
  try {
    const v = Number(localStorage.getItem(HEIGHT_KEY))
    return v >= BODY_MIN ? v : BODY_DEFAULT
  } catch {
    return BODY_DEFAULT
  }
}

// 도크 틀: 손잡이 줄(그립·최소화·최대화·닫기), 드래그 리사이즈, 최소화 미니 바
export function DockFrame(props: {
  mode: DockMode
  setMode: (m: DockMode) => void
  onClose: () => void
  summary: string
  label: string
  children: React.ReactNode
}) {
  const { mode, setMode } = props
  // 저장한 높이(localStorage)는 외부 저장소로 읽고, 끄는 중에는 로컬 값을 쓴다
  const stored = useSyncExternalStore(subscribeStorage, readHeight, () => BODY_DEFAULT)
  const [dragH, setDragH] = useState<number | null>(null)
  const height = dragH ?? stored
  const frame = useRef<HTMLDivElement>(null)
  const save = (h: number) => {
    setDragH(h)
    try {
      localStorage.setItem(HEIGHT_KEY, String(h))
    } catch {}
  }
  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const root = frame.current?.parentElement
    const max = root ? root.getBoundingClientRect().height * 0.6 : 400
    const startY = e.clientY
    const startH = mode === 'min' ? BODY_MIN : height
    if (mode !== 'open') setMode('open')
    const move = (ev: PointerEvent) =>
      save(Math.round(Math.min(max, Math.max(BODY_MIN, startH + startY - ev.clientY))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const icon = 'h-[22px] w-6 cursor-pointer rounded-[5px] leading-none text-ink-2 hover:bg-line-soft'

  if (mode === 'min')
    return (
      <div
        ref={frame}
        role="region"
        aria-label={props.label}
        onPointerDown={drag}
        onClick={(e) => !(e.target as HTMLElement).closest('button') && setMode('open')}
        className="relative flex h-[26px] flex-none cursor-row-resize items-center gap-2.5 rounded-[10px] border border-line bg-surface pr-1.5 pl-4 text-[11.5px] text-ink-2"
      >
        <span className="truncate">{props.summary}</span>
        <span className="absolute top-[10px] left-1/2 -ml-5 h-1 w-10 rounded-sm bg-line" />
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            title="펼치기"
            aria-label="펼치기"
            className={`${icon} text-xs`}
            onClick={() => setMode('open')}
          >
            ▢
          </button>
          <button
            type="button"
            title="닫기"
            aria-label="도크 닫기"
            className={`${icon} text-sm`}
            onClick={props.onClose}
          >
            ×
          </button>
        </span>
      </div>
    )
  return (
    <div
      ref={frame}
      role="region"
      aria-label={props.label}
      className={`flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface ${mode === 'max' ? 'min-h-0 flex-1' : 'flex-none'}`}
    >
      <div
        onPointerDown={drag}
        onDoubleClick={() => save(BODY_DEFAULT)}
        className="relative flex h-[22px] flex-none cursor-row-resize items-center pr-1.5 pl-4"
      >
        <span className="absolute top-2 left-1/2 -ml-5 h-1 w-10 rounded-sm bg-line" />
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            title="최소화"
            aria-label="최소화"
            className={`${icon} text-[13px]`}
            onClick={() => setMode('min')}
          >
            —
          </button>
          <button
            type="button"
            title={mode === 'max' ? '복원' : '최대화'}
            aria-label={mode === 'max' ? '복원' : '최대화'}
            className={`${icon} text-xs`}
            onClick={() => setMode(mode === 'max' ? 'open' : 'max')}
          >
            ⤢
          </button>
          <button
            type="button"
            title="닫기"
            aria-label="도크 닫기"
            className={`${icon} text-sm`}
            onClick={props.onClose}
          >
            ×
          </button>
        </span>
      </div>
      <div
        className={`overflow-auto ${mode === 'max' ? 'flex-1' : ''}`}
        style={mode === 'max' ? undefined : { height }}
      >
        {props.children}
      </div>
    </div>
  )
}

const bodyCls =
  'grid min-h-[84px] grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 text-[13px]'

function ResultLine({
  tone,
  strong,
  text,
  small,
}: {
  tone: keyof typeof dotCls
  strong?: string
  text: string
  small?: boolean
}) {
  return (
    <div className={`flex min-w-0 items-start gap-2 ${small ? 'text-xs text-ink-2' : ''}`}>
      <span className={`mt-[5px] h-2 w-2 flex-none rounded-full ${dotCls[tone]}`} />
      <span className="leading-[1.35]">
        {strong && (
          <b
            className={`mr-1 whitespace-nowrap ${tone === 'bad' ? 'text-danger-ink' : tone === 'ok' ? 'text-primary-hover' : 'text-ink'}`}
          >
            {strong}
          </b>
        )}
        <span className={small ? '' : 'text-nav-ink'}>{text}</span>
      </span>
    </div>
  )
}

// 칸 편집 본문 (5a 위반 상태 · 5b 적용 직후 상태)
export function CellBody(props: {
  view: AdjustView
  input: ScheduleInput
  edits: CellEdit[]
  base: GridCell[]
  userId: string
  date: string
  nameOf: (id: string) => string
  onApply: (edits: CellEdit[]) => void
  onRevert: (k: string) => void
  onLeaveCancelled: (text: string, list: string[]) => void
}) {
  const { view, input, edits, base, userId, date, nameOf } = props
  const k = key(userId, date)
  const orig = input.cells.find((c) => c.userId === userId && c.date === date)
  const now = base.find((c) => c.userId === userId && c.date === date)
  const mine = edits.find((e) => key(e.userId, e.date) === k)
  const [pick, setPick] = useState<Chip | null>(null)
  const [reason, setReason] = useState('')
  const [pending, run] = useTransition()
  const leave = view.leaveCells[k]
  const req = view.requests[k]
  const at = (d: string) =>
    base.find((c) => c.userId === userId && c.date === d) ??
    input.prevTail.find((c) => c.userId === userId && c.date === d)

  const editFor = (c: Chip): CellEdit | null => {
    if (!now) return null
    return {
      userId,
      date,
      before: {
        code: now.code,
        ...(now.offKind ? { offKind: now.offKind } : {}),
        ...(now.leaveKind ? { leaveKind: now.leaveKind } : {}),
      },
      after: c === 'OFF' ? { code: 'OFF', offKind: 'regular' } : { code: c },
      kind: 'manual',
    }
  }
  const baseCheck = useMemo(() => checkSchedule({ ...input, cells: base }), [input, base])

  // 위반 선택 미리보기
  const trial = useMemo(() => {
    if (!pick) return null
    const e = editFor(pick)
    if (!e) return null
    const cells = applyEdits(base, [e])
    return { edit: e, cells, diff: newViolations(baseCheck, checkSchedule({ ...input, cells })) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, base, baseCheck])
  const hard = trial?.diff.hardViolations ?? []
  const staffing = hard.filter(
    (v) => (v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS') && v.dates.includes(date),
  )
  const others = hard.filter((v) => !staffing.includes(v))

  // 해결 제안: 인원 부족만이면 "대상 = 고른 근무 + 후보 = 모자란 듀티", 다른 위반도 있으면 두 칸 교환(v5)
  const resolve = useMemo(() => {
    if (!trial || !hard.length || !now) return null
    if (!others.length && staffing[0]?.shift) {
      const c = replacementCandidates(
        { ...input, cells: trial.cells },
        date,
        staffing[0].shift as DutyCode,
      ).find((x) => x.userId !== userId && !x.newHard.length)
      return c ? { who: c.userId, kTass: c.kTass, edits: [trial.edit, c.edit] } : null
    }
    if (now.code === 'D' || now.code === 'E' || now.code === 'N') {
      const vacated = applyEdits(base, [editFor('OFF')!])
      const c = replacementCandidates({ ...input, cells: vacated }, date, now.code).find(
        (x) => x.userId !== userId && !x.newHard.length,
      )
      const sw = c ? swapEdits(base, date, userId, c.userId) : null
      return c && sw ? { who: c.userId, kTass: c.kTass, edits: sw } : null
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial])

  const click = (c: Chip) => {
    if (!now || !orig) return
    if (mine && c === orig.code && (c !== 'OFF' || (orig.offKind ?? 'regular') === 'regular'))
      return props.onRevert(k)
    if (c === now.code && (c !== 'OFF' || now.offKind !== 'sleeping')) return setPick(null)
    const e = editFor(c)!
    const cells = applyEdits(base, [e])
    const d = newViolations(baseCheck, checkSchedule({ ...input, cells }))
    if (d.hardViolations.length === 0) {
      setPick(null)
      props.onApply([e])
    } else setPick(c)
  }

  // 적용된 변경의 효과(이 칸 편집을 뺀 상태 → 지금)
  const applied = (() => {
    if (!mine || pick) return null
    const without = applyEdits(
      input.cells,
      edits.filter((e) => key(e.userId, e.date) !== k),
    )
    return newViolations(checkSchedule({ ...input, cells: without }), baseCheck)
  })()

  const counts = dayCounts(trial?.cells ?? base, date)
  const kShort = (trial ? trial.diff.hardViolations : baseCheck.hardViolations).some(
    (v) => v.ruleId === 'H-KTASS' && v.dates.includes(date),
  )
  const carryBefore = monthCarry(input, input.cells, userId)
  const carryNow = monthCarry(input, trial?.cells ?? base, userId)
  const rest = (() => {
    const prev = at(shiftDate(date, -1))
    const cur = trial ? trial.cells.find((c) => c.userId === userId && c.date === date) : now
    const next = at(shiftDate(date, 1))
    const w = (c?: GridCell) => (c && ['D', 'E', 'N', 'S'].includes(c.code) ? (c.code as 'D') : null)
    const hs = [
      w(prev) && w(cur) && prev!.code !== cur!.code ? restHoursBetween(w(prev)!, w(cur)!) : null,
      w(cur) && w(next) && cur!.code !== next!.code ? restHoursBetween(w(cur)!, w(next)!) : null,
    ].filter((x): x is number => x !== null)
    return hs.length ? Math.min(...hs) : null
  })()

  if (!now) return <div className={bodyCls}>재직일이 아닌 칸입니다.</div>

  const target = (
    <div className="flex min-w-[132px] flex-col gap-0.5 border-r border-line-soft pr-3.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[14px] font-extrabold">{nameOf(userId)}</span>
        <span className="text-xs text-ink-2">{withDay(date)}</span>
      </div>
      <div className="flex gap-1.5 text-[11.5px] text-ink-2">
        <span>
          전일 <b className="text-ink">{cellLabel(at(shiftDate(date, -1)))}</b>
        </span>
        ·
        <span>
          익일 <b className="text-ink">{cellLabel(at(shiftDate(date, 1)))}</b>
        </span>
        ·
        <span>
          신청{' '}
          <b className={req ? 'text-danger' : 'text-ink'}>
            {req ? req.label.replaceAll(' or ', '/') : '없음'}
          </b>
        </span>
      </div>
    </div>
  )

  if (isLeaveCell(now))
    return (
      <div className={bodyCls}>
        {target}
        <div />
        <div className="flex min-w-0 flex-col gap-1 border-l border-line-soft pl-4">
          <ResultLine
            tone="idle"
            strong="휴가 칸"
            text={leave ? `${leave.kindLabel} · ${leave.range}` : '근무표를 만들 때 들어간 휴가'}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {leave && (
            <button
              type="button"
              disabled={pending}
              className="h-9 cursor-pointer rounded-lg border border-danger px-3 text-[12.5px] font-semibold text-danger"
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
        </div>
      </div>
    )

  const staffLine = `${md(date)} 인원 D ${counts.D} · E ${counts.E} · N ${counts.N} · K-tass ${kShort ? '부족' : '각 듀티 유지'} · ${nameOf(userId)} 누적 OFF ${signed(carryBefore)}${carryNow !== carryBefore ? ` → ${signed(carryNow)}` : ''}`
  const passText = ['규칙 검사 통과', rest !== null ? `휴식 ${rest}시간` : null, '금지 패턴 없음']
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={bodyCls}>
      {target}
      <div className="flex gap-1.5">
        {/* 2-11 R-HEAD-7: 수간호사 칸은 D·S·OFF만 */}
        {CHIPS.filter(
          (c) => view.names[userId]?.rotation !== 'fixed_weekday' || ['D', 'S', 'OFF'].includes(c.code),
        ).map((c) => {
          const isNow = now.code === c.code
          const isOrig = !!mine && orig?.code === c.code
          const bad = pick === c.code
          const border = bad
            ? 'border-danger shadow-[0_0_0_3px_var(--color-danger-bg)]'
            : mine && isNow
              ? 'border-admin'
              : isOrig
                ? 'border-dashed border-ink-5'
                : isNow
                  ? 'border-ink'
                  : 'border-transparent'
          const tag = bad ? null : mine && isNow ? '변경' : isOrig ? '이전' : isNow ? '현재' : null
          return (
            <button
              key={c.code}
              type="button"
              aria-label={c.code}
              aria-pressed={isNow}
              onClick={() => click(c.code)}
              className={`flex h-[38px] w-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 leading-none font-bold text-ink ${c.cls} ${border}`}
            >
              {c.code}
              {tag && (
                <span
                  className={`text-[8.5px] font-semibold ${tag === '변경' ? 'text-admin' : 'text-ink-2'}`}
                >
                  {tag}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex min-w-0 flex-col gap-[3px] border-l border-line-soft pl-4">
        {trial && hard.length > 0 ? (
          <>
            <ResultLine
              tone="bad"
              strong={`${ro(pick!)} 변경 불가 ·`}
              text={(others.length ? others : staffing)
                .map((v) => vText(v, nameOf, view.month, userId))
                .join(' · ')}
            />
            <ResultLine
              small
              tone={staffing.length ? 'warn' : 'ok'}
              text={
                staffing.length
                  ? `${staffing.map((v) => vText(v, nameOf, view.month, userId)).join(' · ')}${
                      resolve
                        ? ` · 대체 후보 ${nameOf(resolve.who)} (OFF${resolve.kTass ? ', K-tass' : ''})`
                        : ' · 대체할 수 있는 사람이 없습니다'
                    }`
                  : `${staffLine}${resolve ? ` · 맞바꿀 수 있는 사람 ${nameOf(resolve.who)}` : ''}`
              }
            />
          </>
        ) : mine && applied ? (
          <>
            <ResultLine
              tone={applied.softWarnings.length ? 'warn' : 'ok'}
              strong={`적용됨 · ${cellLabel(orig)} → ${cellLabel(now)}`}
              text={
                mine.override
                  ? `예외 적용 · 사유 "${mine.override.reason}"`
                  : applied.softWarnings.length
                    ? `권고 · ${applied.softWarnings.map((v) => vText(v, nameOf, view.month, userId)).join(' · ')}`
                    : passText
              }
            />
            <ResultLine small tone={kShort ? 'warn' : 'ok'} text={staffLine} />
          </>
        ) : (
          <>
            <ResultLine tone="idle" text="바꿀 근무를 누르세요 · 규칙을 통과하면 바로 적용됩니다" />
            <ResultLine small tone="idle" text={staffLine} />
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {trial && hard.length > 0 ? (
          <>
            {resolve && (
              <button
                type="button"
                onClick={() => (setPick(null), props.onApply(resolve.edits))}
                className="h-9 cursor-pointer rounded-lg border border-ink bg-surface px-3 text-[12.5px] font-semibold whitespace-nowrap"
              >
                ↔ {nameOf(resolve.who)}
              </button>
            )}
            <input
              aria-label="예외 사유"
              placeholder="사유 (필수)"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 w-[120px] rounded-lg border border-line px-2.5 text-[12.5px]"
            />
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => (
                setPick(null),
                props.onApply([{ ...trial.edit, override: { reason: reason.trim() } }])
              )}
              className="h-9 cursor-pointer rounded-lg border border-danger bg-danger px-3 text-[12.5px] font-semibold whitespace-nowrap text-white disabled:cursor-not-allowed disabled:border-line disabled:bg-panel disabled:text-ink-3"
            >
              그래도 적용
            </button>
          </>
        ) : mine ? (
          <button
            type="button"
            onClick={() => props.onRevert(k)}
            className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold whitespace-nowrap"
          >
            이 변경 되돌리기
          </button>
        ) : null}
      </div>
    </div>
  )
}

// 4a 「승인 · 대체 지정」에서 넘어온 대체 지정 본문
export function ReplacementBody(props: {
  view: AdjustView
  input: ScheduleInput
  base: GridCell[]
  date: string
  shift: DutyCode
  nameOf: (id: string) => string
  onPick: (edit: CellEdit) => void
}) {
  const { view, input, base, date, shift, nameOf } = props
  const check = useMemo(() => checkSchedule({ ...input, cells: base }), [input, base])
  const short = check.hardViolations.filter(
    (v) => (v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS') && v.dates[0] === date && v.shift === shift,
  )
  const list = useMemo(
    () => replacementCandidates({ ...input, cells: base }, date, shift),
    [input, base, date, shift],
  )
  return (
    <div className={bodyCls}>
      <div className="flex min-w-[132px] flex-col gap-0.5 border-r border-line-soft pr-3.5">
        <span className="text-[14px] font-extrabold">
          {md(date)} {shift} 대체 지정
        </span>
        <span className="text-xs text-ink-2">{withDay(date)}</span>
      </div>
      <div />
      <div className="flex min-w-0 flex-col gap-1.5 border-l border-line-soft pl-4">
        <ResultLine
          tone={short.length ? 'bad' : 'ok'}
          text={
            short.length ? short.map((v) => vText(v, nameOf, view.month)).join(' · ') : '인원이 채워졌습니다'
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {list.length === 0 && <span className="text-xs text-ink-3">그날 쉬는 교대 근무자가 없습니다.</span>}
          {list.map((c) => (
            <button
              key={c.userId}
              type="button"
              aria-label={`${nameOf(c.userId)} 지정`}
              disabled={c.newHard.length > 0}
              title={c.newHard.length ? vText(c.newHard[0]!, nameOf, view.month) : ''}
              onClick={() => props.onPick(c.edit)}
              className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-45"
            >
              <b>{nameOf(c.userId)}</b> <span className="text-ink-2">OFF{c.kTass ? ', K-tass' : ''}</span> ·
              지정
            </button>
          ))}
        </div>
      </div>
      <div />
    </div>
  )
}
