'use client'

import { applyEdits, type CellEdit } from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import {
  closeMonthAction,
  previewCloseAction,
  reopenMonthAction,
  saveEditsAction,
  updateNegotiationAction,
} from '@/server/adjust/actions'
import type { AdjustView } from '@/server/adjust/view'
import { cellView, type GridCellView } from '@/server/schedule/view'
import { useHydrated } from '../admin/ui'
import { CellBody, DockFrame, ReplacementBody, cellLabel, type DockMode, type DockTarget } from './Dock'
import { ReceivedList } from './NurseAdjust'

// S9 근무 조정 · 관리자 시점 (Build Spec 2-7, 핸드오프 v5 5a·5b 하단 편집 도크)
const btn2 =
  'h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-[13px] disabled:cursor-default disabled:text-ink-3'
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
const key = (u: string, d: string) => `${u}|${d}`

export function AdjustScreen({ view }: { view: AdjustView }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, start] = useTransition()
  const [edits, setEdits] = useState<CellEdit[]>([])
  const [pop, setPop] = useState<DockTarget | null>(
    view.focus?.shift ? { kind: 'replace', date: view.focus.date, shift: view.focus.shift } : null,
  )
  const [mode, setMode] = useState<DockMode>('open')
  // 맞바꾸기·대체처럼 함께 들어간 편집은 함께 되돌린다
  const [groups, setGroups] = useState<Map<string, string[]>>(new Map())
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; list?: string[] } | null>(null)
  const [closing, setClosing] = useState(false)
  const [hover, setHover] = useState<{ userId: string; date: string } | null>(null)
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
    const ks = next.map((e) => key(e.userId, e.date))
    setGroups((g) => {
      const n = new Map(g)
      for (const k of ks) n.set(k, ks)
      return n
    })
  }
  const revert = (k: string) => {
    const ks = groups.get(k) ?? [k]
    setEdits((prev) => prev.filter((e) => !ks.includes(key(e.userId, e.date))))
    setGroups((g) => {
      const n = new Map(g)
      for (const x of ks) n.delete(x)
      return n
    })
  }
  const openCell = (userId: string, date: string) => {
    setPop({ kind: 'cell', userId, date })
    if (mode === 'min') setMode('open')
  }
  // Esc = 도크 닫기
  useEffect(() => {
    if (!pop) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [pop])

  const save = () =>
    start(async () => {
      if (!view.plan) return
      const r = await saveEditsAction({ planId: view.plan.id, edits })
      if (r.ok) {
        setEdits([])
        setGroups(new Map())
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
      data-adjust-root
      className="relative flex h-screen min-w-0 flex-col gap-3 px-4 py-[18px]"
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
        <span className="ml-auto" />
        {view.editable && (
          <>
            <span
              className={`text-[13px] whitespace-nowrap ${edits.length ? 'font-semibold text-admin' : 'text-ink-2'}`}
            >
              변경 {edits.length}건 미저장
            </span>
            <button
              type="button"
              className={btn2}
              disabled={!edits.length || pending}
              onClick={() => (setEdits([]), setGroups(new Map()))}
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
          <span className="h-3.5 w-3.5 rounded outline-[1.5px] -outline-offset-[1.5px] outline-dashed outline-danger" />
          교환
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded shadow-[inset_0_0_0_2px_var(--color-admin)]" />
          관리자 수정
        </span>
        {view.editable && (
          <span className="ml-2">칸을 누르면 아래 도크에서 바로 바꿉니다 · 규칙을 통과하면 즉시 적용</span>
        )}
      </div>

      {/* 2-11 R-SWAPH-4: 간호사가 수간호사를 넣어 보낸 교환 요청 */}
      {(view.swap?.received.some((q) => q.canRespond) ?? false) && (
        <section aria-label="받은 교환 요청" className="flex flex-col gap-2 rounded-xl bg-warn-bg p-3">
          <span className="text-[13px] font-bold">받은 교환 요청 · 수간호사 근무(S ↔ D)</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
            <ReceivedList
              received={view.swap!.received.filter((q) => q.canRespond)}
              onDone={(text, kind = 'ok') => (setMsg({ kind, text }), router.refresh())}
            />
          </div>
        </section>
      )}
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

      {mode !== 'max' || !pop ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <ScheduleGrid
            view={view.grid}
            ui={
              view.editable
                ? {
                    pending: pendingViews,
                    focusDate: pop?.kind === 'replace' ? pop.date : null,
                    selected: pop?.kind === 'cell' ? { userId: pop.userId, date: pop.date } : null,
                    hover,
                    onHover: setHover,
                    onCell: openCell,
                  }
                : undefined
            }
          />
        </div>
      ) : null}

      {pop && input && (
        <DockFrame
          mode={mode}
          setMode={setMode}
          onClose={() => setPop(null)}
          label={
            pop.kind === 'cell'
              ? `${nameOf(pop.userId)} ${md(pop.date)} 근무 편집`
              : `${md(pop.date)} ${pop.shift} 대체 지정`
          }
          summary={
            pop.kind === 'cell'
              ? (() => {
                  const orig = input.cells.find((c) => c.userId === pop.userId && c.date === pop.date)
                  const now = base.find((c) => c.userId === pop.userId && c.date === pop.date)
                  const changed = edits.some((e) => e.userId === pop.userId && e.date === pop.date)
                  return `${nameOf(pop.userId)} · ${md(pop.date)} · ${changed ? `${cellLabel(orig)} → ${cellLabel(now)} 적용됨` : `현재 ${cellLabel(now)}`}`
                })()
              : `${md(pop.date)} ${pop.shift} 대체 지정`
          }
        >
          {pop.kind === 'cell' ? (
            <CellBody
              key={key(pop.userId, pop.date)}
              view={view}
              input={input}
              edits={edits}
              base={base}
              userId={pop.userId}
              date={pop.date}
              nameOf={nameOf}
              onApply={addEdits}
              onRevert={revert}
              onLeaveCancelled={(text, list) => {
                setPop(null)
                setMsg({ kind: 'ok', text, ...(list.length ? { list } : {}) })
                router.refresh()
              }}
            />
          ) : (
            <ReplacementBody
              view={view}
              input={input}
              base={base}
              date={pop.date}
              shift={pop.shift}
              nameOf={nameOf}
              onPick={(e) => {
                addEdits([e])
                setPop({ kind: 'cell', userId: e.userId, date: e.date })
              }}
            />
          )}
        </DockFrame>
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
