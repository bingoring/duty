'use client'

import {
  applyEdits,
  checkSchedule,
  formatMD,
  formatViolation,
  newViolations,
  sameCounts,
  swapToEdits,
  swappable,
  weekdayKo,
  type SwapCode,
  type SwapItem,
} from '@duty/domain'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { cancelSwapAction, createSwapAction, respondSwapAction } from '@/server/swaps/actions'
import type { AdjustView } from '@/server/adjust/view'
import type { SwapCard } from '@/server/swaps/service'
import type { GridCellView } from '@/server/schedule/view'
import { useHydrated } from '../admin/ui'

// S9 근무 조정 · 간호사 시점 (Build Spec 2-8 frontend-components, 핸드오프 v5 3a)
const CHIP: Record<string, string> = {
  d: 'bg-shift-d',
  e: 'bg-shift-e',
  n: 'bg-shift-n',
  s: 'bg-shift-s',
  off: 'bg-shift-off',
  leave: 'bg-shift-leave',
}
const CODE_CLS: Record<SwapCode, string> = {
  D: 'bg-shift-d',
  E: 'bg-shift-e',
  N: 'bg-shift-n',
  OFF: 'bg-shift-off',
}
const SEL_ROW = 'bg-[#FFF9E8]'
const PANEL_KEY = 'duty.swapPanel.collapsed'
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
const withDay = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`

function useCollapsed(): [boolean, (v: boolean) => void] {
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

export function NurseAdjust({ view, viewerId }: { view: AdjustView; viewerId: string }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [collapsed, setCollapsed] = useCollapsed()
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([viewerId])
  const [date, setDate] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const swap = view.swap
  const open = !!swap?.window.open
  const rows = view.grid.rows.filter((r) => r.kind !== 'head')
  const nameOf = (id: string) => view.names[id]?.name ?? id
  const received = swap?.received.filter((c) => c.status === 'PENDING' && c.canRespond).length ?? 0

  // 30초·창 포커스마다 새로 불러 상대의 수락·거절을 반영한다(팝업이 열려 있으면 미룸, 2-5 방식)
  const busy = useRef(false)
  useEffect(() => {
    busy.current = date !== null
  }, [date])
  useEffect(() => {
    const tick = () => !busy.current && router.refresh()
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => (clearInterval(id), window.removeEventListener('focus', tick))
  }, [router])

  const toggle = (id: string) => {
    if (id === viewerId) return
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  const openDate = (d: string) => {
    if (!selecting) return
    if (picked.length < 2) return setMsg({ kind: 'err', text: '교환할 사람을 1명 이상 더 체크하세요.' })
    setMsg(null)
    setDate(d)
  }
  const reset = () => (setPicked([viewerId]), setDate(null))

  return (
    <div
      data-hydrated={hydrated || undefined}
      className={`grid min-w-0 gap-3 px-4 py-[18px] ${collapsed ? 'grid-cols-[minmax(0,1fr)_72px]' : 'grid-cols-[minmax(0,1fr)_262px]'} transition-[grid-template-columns] duration-200`}
    >
      <div className="relative flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <a
              href={`/adjust?ym=${view.grid.prev}`}
              aria-label="이전 달"
              className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm"
            >
              ‹
            </a>
            <h1 className="text-[20px] font-bold tracking-[-0.02em] whitespace-nowrap">
              {view.year}년 {view.month}월 · 근무 조정
            </h1>
            <a
              href={`/adjust?ym=${view.grid.next}`}
              aria-label="다음 달"
              className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm"
            >
              ›
            </a>
          </div>
          {swap && (
            <span
              className={`rounded-full px-2 py-[3px] text-xs font-semibold whitespace-nowrap ${open ? 'bg-warn-bg text-warn-ink' : 'bg-line-soft text-ink-2'}`}
            >
              {swap.window.label}
            </span>
          )}
          <span className="ml-auto text-xs whitespace-nowrap text-ink-2">
            선택 <b className="text-ink">{picked.length}명</b>
            {date && (
              <>
                {' '}
                · <b className="text-ink">{md(date)}</b>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={reset}
            className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-[13px]"
          >
            선택 해제
          </button>
          <button
            type="button"
            disabled={!open}
            aria-pressed={selecting}
            title={open ? '' : '협의 기간에만 교환 요청을 보낼 수 있습니다'}
            onClick={() => (setSelecting(!selecting), setDate(null))}
            className="h-8 cursor-pointer rounded-lg bg-ink px-3.5 text-[13px] font-bold text-white disabled:cursor-default disabled:opacity-40"
          >
            {selecting ? '조정 끝내기' : '근무 조정'}
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className="h-3.5 w-3.5 rounded border border-line bg-[#FFF9E8]" />
          선택한 사람
          <span className="ml-2 h-3.5 w-3.5 rounded bg-warn-bg" />
          선택한 날짜
          <span className="ml-2 inline-flex items-center gap-1">
            <span className="h-3.5 w-3.5 rounded shadow-[inset_0_0_0_1.5px_var(--color-danger)]" />
            신청 반영
          </span>
          {selecting && <span className="ml-auto">사람을 체크하고 날짜(열 머리나 칸)를 누르세요</span>}
        </div>
        {!swap && (
          <div className="rounded-lg bg-panel px-3 py-2 text-xs text-ink-2">
            확정된 근무표가 있는 달에서 교환을 요청할 수 있습니다.
          </div>
        )}
        {msg && (
          <div
            role={msg.kind === 'err' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-[13px] ${msg.kind === 'err' ? 'bg-danger-bg text-danger-ink' : 'bg-primary-soft text-primary-hover'}`}
          >
            {msg.text}
          </div>
        )}

        {!view.grid.empty && (
          <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
            <div
              role="grid"
              aria-label={`${view.year}년 ${view.month}월 · 교환`}
              className="grid text-[11px]"
              style={{ gridTemplateColumns: `24px 62px repeat(${view.grid.days.length}, minmax(22px, 1fr))` }}
            >
              <div className="row-span-2 border-r border-b border-r-line-soft border-b-line bg-panel" />
              <div className="row-span-2 flex items-center justify-center border-r border-b border-line bg-panel text-ink-2">
                성명
              </div>
              {view.grid.days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-label={`${md(d.date)} 재배정`}
                  disabled={!selecting}
                  onClick={() => openDate(d.date)}
                  className={`flex h-[18px] items-center justify-center border-r border-b border-line-soft ${
                    date === d.date
                      ? 'bg-warn-bg font-extrabold'
                      : d.red
                        ? 'bg-weekend-head font-bold'
                        : 'bg-panel'
                  } ${selecting ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {d.day}
                </button>
              ))}
              {view.grid.days.map((d) => (
                <div
                  key={d.date}
                  className={`flex h-[18px] items-center justify-center border-r border-b border-r-line-soft border-b-line text-[10px] ${date === d.date ? 'bg-warn-bg' : d.red ? 'bg-weekend-head' : 'bg-panel'} ${d.color === 'sun' ? 'text-danger' : d.color === 'sat' ? 'text-admin' : 'text-ink-2'}`}
                >
                  {d.weekday}
                </div>
              ))}
              {rows.map((r) => {
                const sel = picked.includes(r.userId)
                const me = r.userId === viewerId
                return (
                  <div role="row" aria-label={r.name} key={r.userId} className="contents">
                    <div
                      className={`flex h-8 items-center justify-center border-r border-b border-r-line-soft border-b-line-soft ${sel ? SEL_ROW : ''}`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={sel}
                        aria-label={`${r.name} 선택`}
                        disabled={!selecting || me}
                        onClick={() => toggle(r.userId)}
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold ${sel ? 'border-ink bg-ink text-white' : 'border-line bg-surface'} ${selecting && !me ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        {sel ? '✓' : ''}
                      </button>
                    </div>
                    <div
                      className={`flex h-8 items-center truncate border-r border-b border-r-line border-b-line-soft pl-2 ${me ? 'font-extrabold shadow-[inset_3px_0_0_var(--color-primary)]' : 'font-semibold'} ${sel ? SEL_ROW : ''}`}
                    >
                      {r.name}
                    </div>
                    {r.cells.map((c) => (
                      <Cell
                        key={c.date}
                        c={c}
                        rowSel={sel}
                        colSel={date === c.date}
                        onClick={sel && selecting ? () => openDate(c.date) : undefined}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-ink-2">
          협의 기간이 끝나면 요청을 보낼 수 없습니다. 모든 당사자가 수락하면 즉시 근무표에 반영되고, 규칙
          위반(금지 패턴·휴식·최소 인원)이 생기는 조합은 요청 단계에서 차단됩니다.
        </p>

        {date && swap && view.checkInput && view.plan && (
          <SwapPopup
            key={`${date}|${picked.join()}`}
            view={view}
            date={date}
            people={[
              viewerId,
              ...rows.map((r) => r.userId).filter((id) => id !== viewerId && picked.includes(id)),
            ]}
            viewerId={viewerId}
            nameOf={nameOf}
            onClose={() => setDate(null)}
            onSent={(text) => {
              setDate(null)
              setSelecting(false)
              reset()
              setMsg({ kind: 'ok', text })
              router.refresh()
            }}
          />
        )}
      </div>

      <SwapPanel
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        received={swap?.received ?? []}
        sent={swap?.sent ?? []}
        badge={received}
        onDone={(text, kind = 'ok') => (setMsg({ kind, text }), router.refresh())}
      />
    </div>
  )
}

function Cell({
  c,
  rowSel,
  colSel,
  onClick,
}: {
  c: GridCellView
  rowSel: boolean
  colSel: boolean
  onClick?: () => void
}) {
  const cls = `relative flex h-8 items-center justify-center border-r border-b border-line-soft ${colSel ? 'bg-warn-bg' : rowSel ? SEL_ROW : c.weekend ? 'bg-weekend-cell' : ''} ${rowSel && colSel ? 'z-10 outline-2 -outline-offset-2 outline-ink' : ''}`
  const chip = c.chip && (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-[5px] font-bold text-ink ${c.label === 'off' ? 'text-[8.5px]' : 'text-[10.5px]'} ${CHIP[c.chip]} ${c.outline === 'requested' ? 'shadow-[inset_0_0_0_1.5px_var(--color-danger)]' : c.outline === 'admin' ? 'shadow-[inset_0_0_0_2px_var(--color-admin)]' : ''}`}
    >
      {c.label}
    </span>
  )
  return onClick ? (
    <button
      type="button"
      title={c.title}
      data-date={c.date}
      onClick={onClick}
      className={`${cls} cursor-pointer`}
    >
      {chip}
    </button>
  ) : (
    <div title={c.title} data-date={c.date} className={cls}>
      {chip}
    </div>
  )
}

function SwapPopup(props: {
  view: AdjustView
  date: string
  people: string[]
  viewerId: string
  nameOf: (id: string) => string
  onClose: () => void
  onSent: (text: string) => void
}) {
  const { view, date, people, nameOf } = props
  const input = view.checkInput!
  const [pending, run] = useTransition()
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const cells = people.map((id) => input.cells.find((c) => c.userId === id && c.date === date))
  const blocked = people.filter((_, i) => !swappable(cells[i]))
  const [after, setAfter] = useState<SwapCode[]>(() =>
    cells.map((c) => (swappable(c) ? (c!.code as SwapCode) : 'OFF')),
  )
  const [pick, setPick] = useState<number | null>(null)
  const items: SwapItem[] = people.map((id, i) => ({
    userId: id,
    before: { code: (cells[i]?.code ?? 'OFF') as SwapCode },
    after: { code: after[i]! },
  }))
  const changed = items.some((i) => i.before.code !== i.after.code)
  const check = (() => {
    if (blocked.length || !changed) return null
    const edits = swapToEdits(date, items)
    return newViolations(
      checkSchedule(input),
      checkSchedule({ ...input, cells: applyEdits(input.cells, edits) }),
    )
  })()
  const hard = check?.hardViolations ?? []
  const overlap = people.some((id) => (view.swap?.pendingByCell[`${id}|${date}`] ?? []).length > 0)
  const vText = (v: Parameters<typeof formatViolation>[0]) => {
    const f = formatViolation(v, { nameOf, month: view.month })
    return f.detail ? `${f.title} · ${f.detail}` : f.title
  }
  const clickChip = (i: number) => {
    if (pick === null) return setPick(i)
    if (pick === i) return setPick(null)
    const next = [...after]
    ;[next[pick], next[i]] = [next[i]!, next[pick]!]
    setAfter(next)
    setPick(null)
  }
  const others = people.filter((id) => id !== props.viewerId)
  const canSend = !pending && changed && !blocked.length && hard.length === 0 && sameCounts(items)

  return (
    <div
      role="dialog"
      aria-label={`${md(date)} 근무 재배정`}
      className="absolute top-[110px] left-[260px] z-20 flex w-[400px] flex-col gap-3 rounded-xl border border-ink bg-surface p-4 text-[13px] shadow-[0_16px_40px_rgba(0,0,0,.18)]"
      onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold">
          {withDay(date)} · {people.length}인 근무 재배정
        </span>
        <span className="text-xs text-ink-2">칩 두 개를 차례로 눌러 맞바꾸기</span>
      </div>
      <div className="grid grid-cols-[72px_1fr_20px_1fr] items-center gap-x-2.5 gap-y-2 text-xs text-ink-2">
        <span />
        <span>현재</span>
        <span />
        <span className="font-semibold text-ink">변경 후</span>
        {people.map((id, i) => {
          const me = id === props.viewerId
          const ok = swappable(cells[i])
          const cur = (cells[i]?.code ?? '') as SwapCode
          const a = after[i]!
          return (
            <div key={id} className={`contents ${ok ? '' : 'opacity-50'}`}>
              <span className={`text-[13px] ${me ? 'font-bold text-primary' : 'font-semibold text-ink'}`}>
                {nameOf(id)}
                {me ? ' (나)' : ''}
              </span>
              <span
                className={`flex h-[30px] w-[34px] items-center justify-center rounded-[7px] text-xs font-bold text-ink ${CODE_CLS[cur] ?? 'bg-shift-leave'}`}
              >
                {ok ? (cur === 'OFF' ? 'off' : cur) : '휴'}
              </span>
              <span className="text-ink-3">→</span>
              <button
                type="button"
                disabled={!ok}
                aria-label={`${nameOf(id)} 변경 후 ${a}`}
                aria-pressed={pick === i}
                onClick={() => clickChip(i)}
                className={`flex h-[30px] w-[34px] cursor-pointer items-center justify-center rounded-[7px] text-xs font-bold text-ink ${CODE_CLS[a]} ${
                  pick === i ? 'outline-2 outline-offset-2 outline-admin' : ''
                } ${a !== cur ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : ''}`}
              >
                {a === 'OFF' ? 'off' : a}
              </button>
            </div>
          )
        })}
      </div>
      {blocked.length > 0 ? (
        <div className="rounded-lg bg-danger-bg px-2.5 py-2 text-xs leading-[1.5] text-danger-ink">
          <b>교환할 수 없는 칸</b> · {blocked.map(nameOf).join(', ')}의 {md(date)} 칸은
          휴가·교육·슬리핑오프·S라 바꿀 수 없습니다
        </div>
      ) : !changed ? (
        <div className="rounded-lg bg-panel px-2.5 py-2 text-xs text-ink-2">
          변경 후 칩 두 개를 차례로 눌러 근무를 맞바꾸세요.
        </div>
      ) : hard.length ? (
        <div className="rounded-lg bg-danger-bg px-2.5 py-2 text-xs leading-[1.5] text-danger-ink">
          <b>규칙 위반</b> · {hard.map(vText).join(' · ')}
        </div>
      ) : (
        <div className="rounded-lg bg-primary-soft px-2.5 py-2 text-xs leading-[1.5] text-primary-hover">
          <b>규칙 검사 통과</b> · 그날 D/E/N 인원 유지 · K-tass·금지 패턴·휴식 문제 없음
          {check && check.softWarnings.length > 0 && ` · 권고 ${check.softWarnings.length}건`}
        </div>
      )}
      {overlap && (
        <div className="rounded-lg bg-warn-bg px-2.5 py-2 text-xs text-warn-ink">
          같은 칸에 먼저 보낸 요청이 있습니다. 먼저 반영되는 요청만 적용됩니다.
        </div>
      )}
      <textarea
        aria-label="코멘트"
        rows={2}
        maxLength={500}
        placeholder="코멘트 (당사자에게 보임)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="resize-none rounded-lg border border-line px-2.5 py-2 text-[12.5px] leading-[1.5]"
      />
      {err && (
        <div role="alert" className="text-xs text-danger">
          {err}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="mr-auto text-xs text-ink-2">{others.map(nameOf).join(' · ')}에게 요청됩니다</span>
        <button
          type="button"
          onClick={props.onClose}
          className="h-[34px] cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs"
        >
          취소
        </button>
        <button
          type="button"
          disabled={!canSend}
          onClick={() =>
            run(async () => {
              const r = await createSwapAction({
                planId: view.plan!.id,
                date,
                items: items.map((i) => ({ userId: i.userId, after: i.after.code })),
                comment,
              })
              if (!r.ok) return setErr(r.message)
              props.onSent(
                `${others.map(nameOf).join(' · ')}에게 교환을 요청했습니다.${'warning' in r && r.warning ? ` ${r.warning}` : ''}`,
              )
            })
          }
          className="h-[34px] cursor-pointer rounded-lg bg-primary px-4 text-xs font-bold text-white disabled:cursor-default disabled:opacity-40"
        >
          요청 보내기
        </button>
      </div>
    </div>
  )
}

function SwapPanel(props: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  received: SwapCard[]
  sent: SwapCard[]
  badge: number
  onDone: (text: string, kind?: 'ok' | 'err') => void
}) {
  const [tab, setTab] = useState<'recv' | 'sent'>('recv')
  const [pending, run] = useTransition()
  const badge = props.badge > 0 && (
    <span className="rounded-full bg-danger px-[5px] text-[10px] font-bold text-white">{props.badge}</span>
  )
  const toggleBtn =
    'h-7 cursor-pointer whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2'
  if (props.collapsed)
    return (
      <aside aria-label="조정 요청" className="flex flex-col items-center gap-2.5">
        <button type="button" className={toggleBtn} onClick={() => props.setCollapsed(false)}>
          ‹ 펼치기
        </button>
        <div className="relative mt-1.5">
          <span className="text-xs font-bold tracking-[.08em] [writing-mode:vertical-rl]">조정 요청</span>
          {props.badge > 0 && <span className="absolute -top-1.5 -right-2.5">{badge}</span>}
        </div>
      </aside>
    )
  const tabCls = (on: boolean) =>
    `cursor-pointer rounded-lg px-2.5 py-1.5 text-xs ${on ? 'border border-ink bg-ink font-semibold text-white' : 'border border-line bg-surface text-ink-2'}`
  const statusCls = (r: string) =>
    r === 'ACCEPTED' ? 'text-primary' : r === 'REJECTED' ? 'text-danger' : 'text-ink-3'
  const statusText = (r: string) => (r === 'ACCEPTED' ? '수락' : r === 'REJECTED' ? '거절' : '대기')
  return (
    <aside aria-label="조정 요청" className="flex min-w-0 flex-col gap-2.5 text-[13px]">
      <div className="flex items-center gap-1">
        <button type="button" className={tabCls(tab === 'recv')} onClick={() => setTab('recv')}>
          받은 요청 {badge}
        </button>
        <button type="button" className={tabCls(tab === 'sent')} onClick={() => setTab('sent')}>
          보낸 요청 {props.sent.length}
        </button>
        <button type="button" className={`ml-auto ${toggleBtn}`} onClick={() => props.setCollapsed(true)}>
          접기 ›
        </button>
      </div>
      {tab === 'recv' ? (
        <div className="flex flex-col gap-2.5">
          {props.received.length === 0 && <div className="text-xs text-ink-3">받은 요청이 없습니다.</div>}
          {props.received.map((q) => (
            <div
              role="article"
              aria-label={q.title}
              key={q.id}
              className={`flex flex-col gap-1.5 rounded-xl border bg-surface p-3 ${q.canRespond ? 'border-ink' : 'border-line'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{q.from} 님의 요청</span>
                <span className="text-[11px] text-ink-3">{q.when}</span>
              </div>
              <div className="font-semibold">{q.title}</div>
              <div className="text-xs text-ink-2">{q.detail}</div>
              {q.comment && (
                <div className="rounded-md bg-panel px-2 py-1.5 text-xs text-nav-ink">{q.comment}</div>
              )}
              {q.canRespond ? (
                <div className="flex gap-1.5">
                  {(['reject', 'accept'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await respondSwapAction({ id: q.id, decision: d })
                          if (!r.ok) return props.onDone(r.message, 'err')
                          const rr = r as { applied: boolean; message?: string }
                          props.onDone(
                            rr.message ??
                              (d === 'reject'
                                ? '요청을 거절했습니다.'
                                : rr.applied
                                  ? '모두 수락해 근무표에 반영했습니다.'
                                  : '수락했습니다. 다른 당사자의 응답을 기다립니다.'),
                          )
                        })
                      }
                      className={`h-[34px] flex-1 cursor-pointer rounded-lg text-xs ${d === 'accept' ? 'bg-primary font-bold text-white' : 'border border-line bg-surface'}`}
                    >
                      {d === 'accept' ? '수락' : '거절'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-semibold text-ink-2">{q.statusLabel}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {props.sent.length === 0 && <div className="text-xs text-ink-3">보낸 요청이 없습니다.</div>}
          {props.sent.map((q) => (
            <div
              role="article"
              aria-label={q.title}
              key={q.id}
              className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{q.title}</span>
                <span className="text-[11px] text-ink-3">{q.when}</span>
              </div>
              <div className="text-xs text-ink-2">{q.detail}</div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                {q.people.map((p) => (
                  <span key={p.userId} className="inline-flex items-center gap-1">
                    {p.name}{' '}
                    <span className={`font-semibold ${statusCls(p.response)}`}>{statusText(p.response)}</span>
                  </span>
                ))}
                <span
                  className={`ml-auto font-bold ${q.status === 'APPLIED' ? 'text-primary' : q.status === 'PENDING' ? 'text-ink-2' : 'text-danger'}`}
                >
                  {q.statusLabel}
                </span>
              </div>
              {q.canCancel && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await cancelSwapAction({ id: q.id })
                      props.onDone(r.ok ? '요청을 철회했습니다.' : r.message, r.ok ? 'ok' : 'err')
                    })
                  }
                  className="h-7 cursor-pointer self-end rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2"
                >
                  철회
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
