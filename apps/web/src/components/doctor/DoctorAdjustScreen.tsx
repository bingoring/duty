'use client'

import { formatMD, ownerOf, swapChips, weekdayKo, type DoctorChip, type DoctorShiftRow } from '@duty/domain'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  adminEditDoctorShiftAction,
  cancelDoctorSwapAction,
  createDoctorSwapAction,
  previewDoctorSwapAction,
  respondDoctorSwapAction,
} from '@/server/doctor/actions'
import type { SwapItem } from '@/server/doctor/swaps'
import type { CalPerson, CalWeek } from '@/server/doctor/view'
import { Dialog, btnPrimary, btnSecondary, inputCls, useHydrated } from '../admin/ui'
import { DoctorCalendarGrid, KindChip, type ChipMark } from './DoctorCalendar'

// 3-7e 의사 근무 조정 (간호사 S9 패턴). 의사: 내 칩 → 상대 칩 순서로 눌러 맞바꾸기 요청.
// 관리자: 칩을 누르면 하단 도크에서 재배정, 두 번째 칩을 누르면 두 칩을 맞바꾼다. 규칙 검사는 서버가 한다
type Msg = { kind: 'ok' | 'err'; text: string }
type AdminEdit =
  { kind: 'assign'; chip: DoctorChip; userId: string } | { kind: 'swap'; a: DoctorChip; b: DoctorChip }

const chipKey = (c: DoctorChip) => `${c.date}:${c.slot}`
const sameChip = (x: DoctorChip, y: DoctorChip) => x.date === y.date && x.slot === y.slot
const slotName = (s: DoctorChip['slot']) => (s === 'D' ? 'Day' : 'Night')
const withDay = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`
const btnSm =
  'h-7 cursor-pointer rounded-md border border-line bg-surface px-2.5 text-xs font-semibold disabled:cursor-default disabled:opacity-50'

const STATUS: Record<string, { text: string; cls: string }> = {
  PENDING: { text: '대기 중', cls: 'bg-warn-bg text-warn-ink' },
  APPLIED: { text: '반영됨', cls: 'bg-primary-soft text-primary' },
  REJECTED: { text: '거절됨', cls: 'bg-danger-bg text-danger-ink' },
  CANCELLED: { text: '취소됨', cls: 'bg-line-soft text-ink-2' },
  EXPIRED: { text: '만료', cls: 'bg-line-soft text-ink-2' },
  INVALID: { text: '무효', cls: 'bg-danger-bg text-danger-ink' },
}

export function DoctorAdjustScreen(props: {
  header: React.ReactNode
  year: number
  month: number
  today: string
  weeks: CalWeek[]
  doctors: CalPerson[]
  viewerId: string
  admin: boolean
  marks: Record<string, 'admin' | 'swap'>
  swaps: SwapItem[]
}) {
  const { year, month, today, weeks, doctors, viewerId, admin, swaps } = props
  const router = useRouter()
  const hydrated = useHydrated()
  const [msg, setMsg] = useState<Msg | null>(null)
  // 의사: 첫 칩(내 근무) · 맞바꿀 쌍 / 관리자: 고른 칩
  const [first, setFirst] = useState<DoctorChip | null>(null)
  const [pair, setPair] = useState<{ a: DoctorChip; b: DoctorChip } | null>(null)

  const rows: DoctorShiftRow[] = useMemo(
    () =>
      weeks
        .flat()
        .filter((c) => c !== null)
        .map((c) => ({ date: c.date, day: c.day?.id ?? null, night: c.night?.id ?? null })),
    [weeks],
  )
  const people = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors])
  const personOf = (id: string | null): CalPerson | null =>
    id ? (people.get(id) ?? { id, name: '?' }) : null

  const marks = useMemo(() => {
    const m: Record<string, ChipMark> = { ...props.marks }
    for (const q of swaps)
      if (q.status === 'PENDING' && (q.mine || q.received)) {
        m[chipKey(q.a)] = 'pending'
        m[chipKey(q.b)] = 'pending'
      }
    return m
  }, [props.marks, swaps])

  // 맞바꾸기 미리보기: 바뀔 두 칩에 바뀐 사람을 그린다
  const preview = useMemo(() => {
    if (!pair) return undefined
    const after = swapChips(rows, pair.a, pair.b)
    if (!after) return undefined
    const p: Record<string, CalPerson> = {}
    for (const c of [pair.a, pair.b]) {
      const id = ownerOf(after, c)
      if (id) p[chipKey(c)] = people.get(id) ?? { id, name: '?' }
    }
    return p
  }, [pair, rows, people])

  // 관리자 편집: 필수 규칙 위반이면 사유를 받아 다시 보낸다
  const [checked, setChecked] = useState<{ edit: AdminEdit; violations: string[]; done: string } | null>(null)
  const [editErr, setEditErr] = useState('')
  const [editing, runEdit] = useTransition()
  const clear = () => (setFirst(null), setPair(null), setChecked(null), setEditErr(''))
  const sendEdit = (edit: AdminEdit, note: string | null, done: string) =>
    runEdit(async () => {
      setEditErr('')
      const r = await adminEditDoctorShiftAction({ year, month, edit, note })
      if (r.ok) return (clear(), setMsg({ kind: 'ok', text: done }))
      if ('needNote' in r) return setChecked({ edit, violations: r.violations.map((v) => v.message), done })
      // 적용되지 않았으니 맞바꾼 미리보기는 거둔다
      if (edit.kind === 'swap') setPair(null)
      setEditErr(r.message)
    })
  const chipName = (c: DoctorChip) => `${formatMD(c.date)} ${slotName(c.slot)}`

  // Esc = 선택 해제 (대화 상자가 열려 있으면 그것부터 닫는다)
  useEffect(() => {
    if (!first && !pair) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && clear()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [first, pair])

  // 창 포커스·30초마다 다시 불러 상대의 수락·거절을 반영 (선택 중이면 미룬다)
  const busy = useRef(false)
  useEffect(() => {
    busy.current = first !== null || pair !== null
  }, [first, pair])
  useEffect(() => {
    const tick = () => !busy.current && router.refresh()
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => (clearInterval(id), window.removeEventListener('focus', tick))
  }, [router])

  const onDoctorChip = (date: string, slot: DoctorChip['slot'], person: CalPerson) => {
    const chip = { date, slot }
    setMsg(null)
    if (pair) return
    if (date < today) return setMsg({ kind: 'err', text: '지난 날짜는 교환할 수 없습니다.' })
    if (!first || person.id === viewerId) {
      if (person.id !== viewerId) return setMsg({ kind: 'err', text: '내 근무를 먼저 눌러 주세요' })
      setFirst(first && sameChip(first, chip) ? null : chip)
      return
    }
    setPair({ a: first, b: chip })
  }

  const onAdminChip = (date: string, slot: DoctorChip['slot']) => {
    const chip = { date, slot }
    setMsg(null)
    if (!first || pair || checked) return (setFirst(chip), setPair(null), setChecked(null), setEditErr(''))
    if (sameChip(first, chip)) return clear()
    if (editing) return
    setPair({ a: first, b: chip })
    setChecked(null)
    const x = personOf(ownerOf(rows, first))?.name ?? '?'
    const y = personOf(ownerOf(rows, chip))?.name ?? '?'
    sendEdit(
      { kind: 'swap', a: first, b: chip },
      null,
      `${chipName(first)} ${x} ↔ ${chipName(chip)} ${y} 맞바꿨습니다.`,
    )
  }

  const selected = pair ? [pair.a, pair.b] : first ? [first] : []
  const received = swaps.filter((q) => q.received && q.status === 'PENDING')
  const sent = swaps.filter((q) => q.mine && q.status === 'PENDING')
  const others = swaps.filter((q) => !q.mine && !q.received && q.status === 'PENDING')
  const closed = swaps.filter((q) => q.status !== 'PENDING')

  return (
    <div
      data-hydrated={hydrated || undefined}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_280px] gap-3 px-4 py-[18px]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {props.header}
          <span className="text-xs text-ink-2">
            {admin
              ? '칩을 누르면 아래 도크에서 재배정 · 다른 칩을 이어 누르면 맞바꾸기'
              : '칩 두 개를 차례로 눌러 맞바꾸기'}
          </span>
          {(first || pair) && (
            <button type="button" onClick={clear} className={`ml-auto ${btnSm}`}>
              선택 해제
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-3.5 w-3.5 rounded shadow-[0_0_0_2px_var(--color-admin)]" />
            관리자 수정
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3.5 w-3.5 rounded outline-[1.5px] outline-danger outline-dashed" />
            교환
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3.5 w-3.5 rounded outline-[1.5px] outline-warn-dot outline-dotted" />
            대기 중인 교환
          </span>
        </div>
        {msg && (
          <div
            role={msg.kind === 'err' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-[13px] ${
              msg.kind === 'err' ? 'bg-danger-bg text-danger-ink' : 'bg-primary-soft text-primary-hover'
            }`}
          >
            {msg.text}
          </div>
        )}
        <DoctorCalendarGrid
          month={month}
          weeks={weeks}
          viewerId={viewerId}
          hooks={{
            onChip: admin ? (d, s) => onAdminChip(d, s) : onDoctorChip,
            selected,
            marks,
            ...(preview ? { preview } : {}),
          }}
        />
        {admin && first && (
          <AdminDock
            key={pair ? `${chipKey(pair.a)}|${chipKey(pair.b)}` : chipKey(first)}
            chip={first}
            pair={pair}
            owner={personOf(ownerOf(rows, first))}
            doctors={doctors}
            pending={editing}
            checked={checked}
            err={editErr}
            label={chipName}
            onAssign={(d) =>
              sendEdit(
                { kind: 'assign', chip: first, userId: d.id },
                null,
                `${chipName(first)}을(를) ${d.name}에게 배정했습니다.`,
              )
            }
            onNote={(note) => checked && sendEdit(checked.edit, note, `${checked.done} (사유 기록)`)}
            onClear={clear}
          />
        )}
      </div>

      <aside aria-label="교환 요청" className="flex flex-col gap-3">
        <SwapSection title="받은 요청" empty="받은 요청이 없습니다">
          {received.map((q) => (
            <SwapCard key={q.id} q={q} onMsg={setMsg} respond />
          ))}
        </SwapSection>
        <SwapSection title="보낸 요청" empty="보낸 요청이 없습니다">
          {sent.map((q) => (
            <SwapCard key={q.id} q={q} onMsg={setMsg} cancel />
          ))}
        </SwapSection>
        {admin && others.length > 0 && (
          <SwapSection title="다른 의사 간 대기 요청" empty="">
            {others.map((q) => (
              <SwapCard key={q.id} q={q} onMsg={setMsg} />
            ))}
          </SwapSection>
        )}
        {closed.length > 0 && (
          <SwapSection title="최근 처리" empty="">
            {closed.map((q) => (
              <SwapCard key={q.id} q={q} onMsg={setMsg} />
            ))}
          </SwapSection>
        )}
      </aside>

      {!admin && pair && (
        <SwapDialog
          key={`${chipKey(pair.a)}|${chipKey(pair.b)}`}
          year={year}
          month={month}
          a={pair.a}
          b={pair.b}
          rows={rows}
          viewerId={viewerId}
          personOf={personOf}
          onClose={() => setPair(null)}
          onDone={(text) => (clear(), setMsg({ kind: 'ok', text }))}
        />
      )}
    </div>
  )
}

// ── 의사: 맞바꾸기 요청 대화 상자 ──────────────────────────────────────
type Preview =
  { ok: true; hard: { message: string }[]; soft: { message: string }[] } | { ok: false; message: string }

function slotsOf(rows: readonly DoctorShiftRow[], userId: string, date: string): 'D' | 'N' | 'ALLDAY' | null {
  const r = rows.find((x) => x.date === date)
  const d = r?.day === userId
  const n = r?.night === userId
  return d && n ? 'ALLDAY' : d ? 'D' : n ? 'N' : null
}

function SwapDialog(props: {
  year: number
  month: number
  a: DoctorChip
  b: DoctorChip
  rows: DoctorShiftRow[]
  viewerId: string
  personOf: (id: string | null) => CalPerson | null
  onClose: () => void
  onDone: (text: string) => void
}) {
  const { a, b, rows, viewerId } = props
  const [result, setResult] = useState<Preview | null>(null)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const [pending, run] = useTransition()
  const target = props.personOf(ownerOf(rows, b))
  const me = props.personOf(viewerId)
  const after = useMemo(() => swapChips(rows, a, b), [rows, a, b])
  const dates = a.date === b.date ? [a.date] : [a.date, b.date].sort()
  const two = dates.length > 1

  useEffect(() => {
    let alive = true
    void previewDoctorSwapAction({ year: props.year, month: props.month, a, b, comment: null }).then((r) => {
      if (alive) setResult(r as Preview)
    })
    return () => {
      alive = false
    }
  }, [props.year, props.month, a, b])

  const title = two
    ? `${formatMD(dates[0]!)} ↔ ${formatMD(dates[1]!)} · 근무 맞바꾸기`
    : `${withDay(a.date)} · 근무 맞바꾸기`
  const hard = result?.ok ? result.hard : []
  const soft = result?.ok ? result.soft : []
  const canSend = !!result?.ok && hard.length === 0 && !!after && !pending

  const chips = (src: readonly DoctorShiftRow[] | null, id: string, changed: boolean) => (
    <div className="flex flex-wrap items-center gap-1">
      {dates.map((d) => {
        const k = src ? slotsOf(src, id, d) : null
        return (
          <span key={d} className="inline-flex items-center gap-1">
            {two && <span className="text-[11px] text-ink-2">{formatMD(d)}</span>}
            {k ? (
              <span className={`rounded-[7px] ${changed ? 'shadow-[0_0_0_2px_var(--color-ink)]' : ''}`}>
                <KindChip kind={k} />
              </span>
            ) : (
              <span className="inline-flex h-6 min-w-[52px] items-center justify-center rounded-[6px] bg-shift-off text-xs text-ink-2">
                —
              </span>
            )}
          </span>
        )
      })}
    </div>
  )

  return (
    <Dialog title={title} onClose={props.onClose} width={520}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-xs text-ink-2">
            <th className="py-1.5 text-left font-semibold">이름</th>
            <th className="text-left font-semibold">현재</th>
            <th aria-hidden />
            <th className="text-left font-semibold">변경 후</th>
          </tr>
        </thead>
        <tbody>
          {[me, target].map(
            (p) =>
              p && (
                <tr key={p.id} className="border-b border-line-soft">
                  <td className={`py-2 font-semibold ${p.id === viewerId ? 'text-primary' : ''}`}>
                    {p.name}
                    {p.id === viewerId && ' (나)'}
                  </td>
                  <td>{chips(rows, p.id, false)}</td>
                  <td aria-hidden className="px-2 text-ink-3">
                    →
                  </td>
                  <td>{chips(after, p.id, true)}</td>
                </tr>
              ),
          )}
        </tbody>
      </table>

      <div className="flex flex-col gap-1.5" aria-live="polite">
        {!result && <div className="text-xs text-ink-2">규칙을 확인하는 중…</div>}
        {result && !result.ok && (
          <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">
            {result.message}
          </div>
        )}
        {hard.map((v) => (
          <div key={v.message} className="rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">
            <b>규칙 위반</b> · {v.message}
          </div>
        ))}
        {soft.map((v) => (
          <div key={v.message} className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">
            <b>권고</b> · {v.message}
          </div>
        ))}
        {result?.ok && hard.length === 0 && soft.length === 0 && (
          <div className="rounded-lg bg-primary-soft px-3 py-2 text-primary-hover">규칙 위반 없음</div>
        )}
      </div>

      <label className="flex flex-col gap-1.5 font-semibold">
        코멘트 (당사자에게 보임)
        <textarea
          value={comment}
          maxLength={200}
          rows={2}
          onChange={(e) => setComment(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal"
        />
      </label>
      {err && (
        <div role="alert" className="text-danger">
          {err}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-2">{target?.name ?? '상대'}에게 요청됩니다</span>
        <button type="button" className={`ml-auto ${btnSecondary}`} onClick={props.onClose}>
          취소
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={!canSend}
          onClick={() =>
            run(async () => {
              const r = await createDoctorSwapAction({
                year: props.year,
                month: props.month,
                a,
                b,
                comment: comment.trim() || null,
              })
              if (r.ok) props.onDone(`${target?.name ?? '상대'}에게 교환 요청을 보냈습니다.`)
              else setErr(r.message)
            })
          }
        >
          요청 보내기
        </button>
      </div>
    </Dialog>
  )
}

// ── 관리자: 하단 편집 도크 ─────────────────────────────────────────────
function AdminDock(props: {
  chip: DoctorChip
  pair: { a: DoctorChip; b: DoctorChip } | null
  owner: CalPerson | null
  doctors: CalPerson[]
  pending: boolean
  checked: { violations: string[] } | null
  err: string
  label: (c: DoctorChip) => string
  onAssign: (d: CalPerson) => void
  onNote: (note: string) => void
  onClear: () => void
}) {
  const { chip, pair, owner, pending, checked, err, label } = props
  const [note, setNote] = useState('')

  return (
    <section
      role="region"
      aria-label="칸 편집"
      className="sticky bottom-0 z-10 flex flex-col gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] shadow-popover"
    >
      <div className="flex items-center gap-3">
        <span className="font-bold">
          {pair ? (
            <>
              {label(pair.a)} ↔ {label(pair.b)} · 맞바꾸기
            </>
          ) : (
            <>
              {formatMD(chip.date)} {slotName(chip.slot)} · {owner?.name ?? '비어 있음'}
            </>
          )}
        </span>
        {!pair && <span className="text-xs text-ink-2">다른 칩을 누르면 두 칩을 맞바꿉니다</span>}
        <button type="button" onClick={props.onClear} className={`ml-auto ${btnSm}`}>
          선택 해제
        </button>
      </div>

      {!pair && (
        <div role="group" aria-label="재배정" className="flex flex-wrap gap-1.5">
          {props.doctors.map((d) => {
            const cur = d.id === owner?.id
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={cur}
                disabled={cur || pending}
                onClick={() => props.onAssign(d)}
                className={`h-8 cursor-pointer rounded-lg border px-3 text-[13px] font-semibold disabled:cursor-default ${
                  cur
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface hover:bg-panel disabled:opacity-50'
                }`}
              >
                {d.name}
              </button>
            )
          })}
        </div>
      )}
      {pending && <div className="text-xs text-ink-2">규칙을 확인하는 중…</div>}

      {checked && (
        <div className="flex flex-col gap-2">
          <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">
            <div className="font-bold">필수 규칙 위반 — 사유를 남겨야 적용됩니다</div>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {checked.violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 font-semibold">
              사유
              <input
                value={note}
                maxLength={200}
                required
                onChange={(e) => setNote(e.target.value)}
                className={`${inputCls} font-normal`}
              />
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={!note.trim() || pending}
              onClick={() => props.onNote(note.trim())}
            >
              사유와 함께 적용
            </button>
          </div>
        </div>
      )}
      {err && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">
          {err}
        </div>
      )}
    </section>
  )
}

// ── 교환 요청 목록 ─────────────────────────────────────────────────────
function SwapSection({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
    >
      <h2 className="text-[13px] font-bold">
        {title} {children.length > 0 && <span className="text-ink-2">{children.length}</span>}
      </h2>
      {children.length === 0 ? <p className="text-xs text-ink-3">{empty}</p> : children}
    </section>
  )
}

function SwapCard({
  q,
  onMsg,
  respond,
  cancel,
}: {
  q: SwapItem
  onMsg: (m: Msg) => void
  respond?: boolean
  cancel?: boolean
}) {
  const [pending, run] = useTransition()
  const st = STATUS[q.status] ?? { text: q.status, cls: 'bg-line-soft text-ink-2' }
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    run(async () => {
      const r = await fn()
      onMsg(r.ok ? { kind: 'ok', text: done } : { kind: 'err', text: r.message ?? '처리하지 못했습니다.' })
    })
  return (
    <article className="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-panel p-2.5 text-xs">
      <div className="flex items-start gap-2">
        <span className="flex-1 leading-[1.5]">
          <b>{q.requester}</b> {q.a.label} ↔ <b>{q.target}</b> {q.b.label}
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold ${st.cls}`}>
          {st.text}
        </span>
      </div>
      {q.comment && <p className="text-ink-2">“{q.comment}”</p>}
      {q.closedReason && <p className="text-danger-ink">{q.closedReason}</p>}
      {(respond || cancel) && (
        <div className="flex justify-end gap-1.5">
          {respond && (
            <>
              <button
                type="button"
                className={btnSm}
                disabled={pending}
                onClick={() => act(() => respondDoctorSwapAction(q.id, false), '요청을 거절했습니다.')}
              >
                거절
              </button>
              <button
                type="button"
                className={`${btnSm} border-primary bg-primary text-white`}
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    const r = await respondDoctorSwapAction(q.id, true)
                    if (r.ok && r.status !== 'APPLIED')
                      return {
                        ok: false,
                        message: `반영하지 못했습니다 (${STATUS[r.status]?.text ?? r.status}).`,
                      }
                    return r
                  }, '수락했습니다. 근무표에 반영됐습니다.')
                }
              >
                수락
              </button>
            </>
          )}
          {cancel && (
            <button
              type="button"
              className={btnSm}
              disabled={pending}
              onClick={() => act(() => cancelDoctorSwapAction(q.id), '요청을 취소했습니다.')}
            >
              취소
            </button>
          )}
        </div>
      )}
    </article>
  )
}
