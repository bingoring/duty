'use client'

import {
  allDayPresets,
  allDayRangeLabel,
  dayOfWeek,
  DOCTOR_OPTION_LABEL,
  DOCTOR_OPTION_VALUES,
  fixedRuleLabel,
  formatMD,
  requestConflicts,
  weekdayKo,
  type DoctorFixedRule,
  type DoctorOption,
  type DoctorPrefs,
  type FixedOnDate,
} from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useState, useTransition } from 'react'
import { btnPrimary, btnSecondary, Dialog, inputCls, useHydrated } from '@/components/admin/ui'
import { saveDoctorPrefsAction, saveDoctorRequestsAction } from '@/server/doctor/actions'
import type { DoctorRequestsView, MyRequest } from '@/server/doctor/requests'

// 3-7c S-D2 의사 근무 신청 (핸드오프 1280×780). 칸을 누르면 우측 패널이 그 날로 바뀐다(팝오버 없음)
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const ALLDAY_BG = 'linear-gradient(90deg,#FBE7B5 50%,#D9D6F2 50%)'
const OPT_BG: Record<DoctorOption, string> = {
  D: 'bg-shift-d',
  N: 'bg-shift-n',
  O: 'bg-shift-off',
  ALLDAY: '',
}
const navBtn =
  'flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm hover:bg-panel'
const card = 'flex flex-col gap-2.5 rounded-card border bg-surface p-3.5 text-[13px]'

type Draft = { options: DoctorOption[]; comment: string }
type Conflict = { date: string; labels: string[] }

const toDraft = (m: Record<string, MyRequest>): Record<string, Draft> =>
  Object.fromEntries(Object.entries(m).map(([d, r]) => [d, { options: r.options, comment: r.comment ?? '' }]))
const optText = (o: readonly DoctorOption[]) => o.map((x) => DOCTOR_OPTION_LABEL[x]).join('/')
const sameDraft = (a: Draft | undefined, b: Draft | undefined) =>
  [...(a?.options ?? [])].sort().join() === [...(b?.options ?? [])].sort().join() &&
  (a?.comment ?? '').trim() === (b?.comment ?? '').trim()
const dateLabel = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`
const fixedChipText = (f: FixedOnDate) =>
  f.type === 'require' ? (f.shift === 'ANY' ? '근무' : f.shift) : f.shift === 'ANY' ? 'O' : `${f.shift} 금지`

export function DoctorRequestsScreen({
  view,
  today,
  admin,
  prev,
  next,
}: {
  view: DoctorRequestsView
  today: string
  admin: boolean
  prev: string
  next: string
}) {
  const router = useRouter()
  const hydrated = useHydrated()
  const base = toDraft(view.mine)
  const [draft, setDraft] = useState<Record<string, Draft>>(base)
  // 제출 뒤 다시 읽은 신청으로 로컬 편집을 맞춘다 (같은 의사·같은 달이면 선택한 날·안내는 그대로)
  const mineKey = JSON.stringify(view.mine)
  const [loadedKey, setLoadedKey] = useState(mineKey)
  if (loadedKey !== mineKey) {
    setLoadedKey(mineKey)
    setDraft(base)
  }
  const [sel, setSel] = useState(view.days[0]!)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [pending, start] = useTransition()

  const ym = `${view.year}-${String(view.month).padStart(2, '0')}`
  const href = (m: string, user = view.userId) =>
    `/doctor/requests?ym=${m}${admin && user ? `&user=${user}` : ''}`
  const changed = view.days.filter((d) => !sameDraft(draft[d], base[d]))
  const fixedOf = (d: string) => view.myFixed.filter((f) => f.date === d)

  const lead = dayOfWeek(view.days[0]!)
  const cells: (string | null)[] = [...Array(lead).fill(null), ...view.days]
  while (cells.length % 7) cells.push(null)

  const cur = draft[sel] ?? { options: [], comment: '' }
  const curConflicts = requestConflicts(cur.options, fixedOf(sel))
  const setCur = (patch: Partial<Draft>) => setDraft((p) => ({ ...p, [sel]: { ...cur, ...patch } }))
  const toggle = (o: DoctorOption) =>
    setCur({ options: cur.options.includes(o) ? cur.options.filter((x) => x !== o) : [...cur.options, o] })

  const submit = (exceptions: string[]) =>
    start(async () => {
      setMsg(null)
      // 이미 예외로 저장된 날은 다시 묻지 않는다
      const kept = changed.filter((d) => view.mine[d]?.fixedException)
      const r = await saveDoctorRequestsAction({
        year: view.year,
        month: view.month,
        userId: view.userId,
        items: changed.map((d) => ({
          date: d,
          options: draft[d]?.options ?? [],
          comment: draft[d]?.comment.trim() || null,
        })),
        exceptions: [...new Set([...exceptions, ...kept])],
      })
      if (r.ok) {
        setConflicts(null)
        setMsg({ ok: true, text: '제출했습니다' })
      } else if ('conflicts' in r) setConflicts(r.conflicts)
      else {
        setConflicts(null)
        setMsg({ ok: false, text: r.message })
      }
    })

  const deadline = formatMD(view.plan.requestDeadline)
  const status =
    view.plan.status === 'CONFIRMED' ? '확정됨' : today > view.plan.requestDeadline ? '신청 마감됨' : null
  const sameDay = view.others[sel] ?? []

  return (
    <div data-hydrated={hydrated || undefined} className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Link href={href(prev)} aria-label="이전 달" className={navBtn}>
            ‹
          </Link>
          <h1 className="text-xl font-bold tracking-[-0.02em]">{view.month}월 근무 신청</h1>
          <Link href={href(next)} aria-label="다음 달" className={navBtn}>
            ›
          </Link>
        </div>
        {status ? (
          <span className="rounded-full bg-line-soft px-2 py-[3px] text-xs font-semibold text-ink-2">
            {status}
          </span>
        ) : (
          <span className="rounded-full bg-warn-bg px-2 py-[3px] text-xs font-bold text-warn-ink">
            신청 마감 {deadline} · {view.daysLeft}일 남음
          </span>
        )}
        <span className="text-xs text-ink-2">
          조정 ~{formatMD(view.plan.negotiationEnd)} · 일찍 확정되면 조기 배포
        </span>
        {admin && (
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-2">
            의사
            <select
              aria-label="의사 선택"
              className="h-[30px] rounded-lg border border-line bg-surface px-2 text-[13px] text-ink"
              value={view.userId}
              onChange={(e) => router.push(href(ym, e.target.value))}
            >
              {view.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        <div
          role="grid"
          aria-label={`${view.month}월 신청 달력`}
          className="grid grid-cols-7 overflow-hidden rounded-card border border-line bg-surface"
        >
          {WEEK.map((w, i) => (
            <div
              key={w}
              role="columnheader"
              className={`flex h-[30px] items-center justify-center bg-panel text-xs font-bold ${
                i === 0 ? 'text-danger' : i === 6 ? 'text-admin' : ''
              }`}
            >
              {w}
            </div>
          ))}
          {cells.map((d, i) =>
            d ? (
              <DayCell
                key={d}
                date={d}
                mine={draft[d]}
                changed={!sameDraft(draft[d], base[d])}
                fixed={fixedOf(d)}
                exception={!!view.mine[d]?.fixedException}
                others={view.others[d] ?? []}
                selected={d === sel}
                onSelect={() => setSel(d)}
              />
            ) : (
              <div key={`b${i}`} className="min-h-[86px] border-t border-l border-line-soft bg-panel" />
            ),
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <div className={`${card} border-ink`}>
            <div className="text-[13px]">
              <span className="font-bold">{dateLabel(sel)} 신청</span>
              <span className="text-ink-2"> · 복수 선택 · or</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {DOCTOR_OPTION_VALUES.map((o) => {
                const on = cur.options.includes(o)
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    disabled={!view.editable}
                    onClick={() => toggle(o)}
                    className={`h-9 cursor-pointer rounded-lg text-[13px] font-bold text-ink disabled:cursor-default ${OPT_BG[o]} ${
                      on ? 'border-2 border-ink' : 'border border-line opacity-50'
                    }`}
                    style={o === 'ALLDAY' ? { background: ALLDAY_BG } : undefined}
                  >
                    {DOCTOR_OPTION_LABEL[o]}
                  </button>
                )
              })}
            </div>
            {curConflicts.length > 0 && (
              <div role="alert" className="rounded-md bg-danger-bg px-2 py-1.5 text-xs text-danger-ink">
                고정 조건 「{curConflicts.join(', ')}」과 부딪힙니다
                {view.mine[sel]?.fixedException
                  ? ' · 이 날은 조건 예외로 저장됨'
                  : ' · 제출할 때 예외 여부를 묻습니다'}
              </div>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
              코멘트 (관리자만 열람)
              <textarea
                maxLength={200}
                rows={2}
                disabled={!view.editable}
                value={cur.comment}
                onChange={(e) => setCur({ comment: e.target.value })}
                className="resize-none rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] font-normal text-ink disabled:opacity-60"
              />
            </label>
            <div className="text-xs text-ink-2">
              같은 날 신청: {sameDay.length ? sameDay.map((o) => `${o.name} ${o.text}`).join(' · ') : '없음'}
            </div>
          </div>

          <PrefsCard view={view} />

          <div className="rounded-card border border-dashed border-line px-3.5 py-3 text-xs leading-[1.6] text-ink-2">
            <span className="font-bold text-ink">
              {view.month}월 목표 ({view.days.length}일)
            </span>{' '}
            D {view.target.D} · N {view.target.N} · 올데이 {allDayRangeLabel(view.prefs)} / 연차 없음 · 연속
            휴무 제한 없음 · N-O-D 가능
          </div>

          <button
            type="button"
            className={btnPrimary}
            disabled={!view.editable || changed.length === 0 || pending}
            onClick={() => submit([])}
          >
            신청 제출
          </button>
          {msg && (
            <div role="status" className={`text-xs ${msg.ok ? 'text-primary' : 'text-danger'}`}>
              {msg.text}
            </div>
          )}
        </aside>
      </div>

      {conflicts && (
        <Dialog title="고정 조건과 부딪히는 신청이 있습니다" onClose={() => setConflicts(null)}>
          <ul className="flex flex-col gap-1 rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">
            {conflicts.map((c) => (
              <li key={c.date}>
                {dateLabel(c.date)} · {c.labels.join(', ')}
              </li>
            ))}
          </ul>
          <p>이 날만 조건 예외로 처리할까요?</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setConflicts(null)}>
              취소
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={pending}
              onClick={() => submit(conflicts.map((c) => c.date))}
            >
              이 날만 예외로 제출
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function DayCell({
  date,
  mine,
  changed,
  fixed,
  exception,
  others,
  selected,
  onSelect,
}: {
  date: string
  mine: Draft | undefined
  changed: boolean
  fixed: FixedOnDate[]
  exception: boolean
  others: DoctorRequestsView['others'][string]
  selected: boolean
  onSelect: () => void
}) {
  const dow = dayOfWeek(date)
  const dom = Number(date.slice(8))
  const opts = mine?.options ?? []
  return (
    <button
      type="button"
      aria-label={`${dom}일`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-[86px] cursor-pointer flex-col items-start gap-1 border-t border-l border-line-soft px-2 py-1.5 text-left hover:bg-panel ${
        selected ? 'relative z-10 outline-2 -outline-offset-2 outline-ink' : ''
      }`}
    >
      <span
        className={`text-[13px] font-bold ${dow === 0 ? 'text-danger' : dow === 6 ? 'text-admin' : 'text-ink'}`}
      >
        {dom}
        {changed && <span className="ml-1 text-[10px] font-semibold text-warn-dot">수정</span>}
      </span>
      {opts.length > 0 && (
        <span className="inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-md bg-surface px-1.5 text-[11px] font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--color-danger)]">
          {optText(opts)}
        </span>
      )}
      {fixed.map((f, i) => (
        <span key={i} className="flex flex-col items-start gap-0.5">
          <span
            className={`inline-flex h-[22px] items-center rounded-md border border-dashed border-ink-3 px-1.5 text-[11px] font-bold text-ink-2 ${
              exception ? 'line-through opacity-60' : ''
            }`}
          >
            {fixedChipText(f)}
          </span>
          <span className="text-[10px] text-ink-3">{exception ? '고정 예외' : `고정 · ${f.label}`}</span>
        </span>
      ))}
      {others.map((o, i) => (
        <span key={i} className="text-[11px] leading-[1.3] text-ink-3">
          {o.name} {o.text}
        </span>
      ))}
    </button>
  )
}

// 내 근무 조건 — 바꿀 때마다 바로 저장. 신청 마감과 상관없이 고칠 수 있다
function PrefsCard({ view }: { view: DoctorRequestsView }) {
  const [prefs, setOptimistic] = useOptimistic(view.prefs)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const [custom, setCustom] = useState({ min: str(view.prefs.allDayMin), max: str(view.prefs.allDayMax) })
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Pick<DoctorFixedRule, 'weekday' | 'shift' | 'type'>>({
    weekday: 0,
    shift: 'ANY',
    type: 'forbid',
  })
  const presets = allDayPresets(view.perMonth)
  const active =
    prefs.allDayMin === null && prefs.allDayMax === null
      ? 'unlimited'
      : (presets.find((p) => p.min === prefs.allDayMin && p.max === prefs.allDayMax)?.key ?? 'custom')

  const save = (next: DoctorPrefs) =>
    start(async () => {
      setError('')
      setOptimistic(next)
      const r = await saveDoctorPrefsAction(view.userId, next)
      if (!r.ok) {
        setError(r.message)
        setCustom({ min: str(view.prefs.allDayMin), max: str(view.prefs.allDayMax) })
      }
    })
  const setRange = (min: number | null, max: number | null) => {
    setCustom({ min: str(min), max: str(max) })
    save({ ...prefs, allDayMin: min, allDayMax: max })
  }
  const commitCustom = () => {
    const min = num(custom.min)
    const max = num(custom.max)
    if (min !== prefs.allDayMin || max !== prefs.allDayMax) save({ ...prefs, allDayMin: min, allDayMax: max })
  }
  const setRules = (fixedRules: DoctorFixedRule[]) => save({ ...prefs, fixedRules })
  const addRule = () => {
    if (
      prefs.fixedRules.some(
        (r) => r.weekday === form.weekday && r.shift === form.shift && r.type === form.type,
      )
    )
      return setError('이미 있는 조건입니다.')
    setRules([...prefs.fixedRules, { id: crypto.randomUUID(), ...form, enabled: true }])
    setAdding(false)
  }
  const seg = (on: boolean) =>
    `h-[30px] flex-1 cursor-pointer rounded-md text-xs font-semibold ${on ? 'bg-ink text-white' : 'text-ink-2 hover:bg-panel'}`
  const sel = 'h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-1.5 text-xs'

  return (
    <section aria-label="내 근무 조건" className={`${card} border-line`} aria-busy={pending || undefined}>
      <div className="flex items-baseline justify-between">
        <span className="font-bold">내 근무 조건</span>
        <span className="text-[11px] text-ink-3">매달 자동 적용</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">한 달 올데이 개수</span>
        <div
          role="group"
          aria-label="올데이 개수"
          className="flex gap-0.5 rounded-lg border border-line p-0.5"
        >
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={active === p.key}
              className={seg(active === p.key)}
              onClick={() => setRange(p.min, p.max)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className={active === 'custom' ? 'font-bold text-ink' : ''}>직접 입력</span>
          <input
            type="number"
            min={0}
            max={31}
            aria-label="올데이 최소"
            className={`${inputCls} h-[30px] w-14 px-2 text-xs`}
            value={custom.min}
            onChange={(e) => setCustom((c) => ({ ...c, min: e.target.value }))}
            onBlur={commitCustom}
          />
          ~
          <input
            type="number"
            min={0}
            max={31}
            aria-label="올데이 최대"
            className={`${inputCls} h-[30px] w-14 px-2 text-xs`}
            value={custom.max}
            onChange={(e) => setCustom((c) => ({ ...c, max: e.target.value }))}
            onBlur={commitCustom}
          />
          <button
            type="button"
            aria-pressed={active === 'unlimited'}
            className={`ml-auto h-[30px] cursor-pointer rounded-md border px-2 font-semibold ${
              active === 'unlimited' ? 'border-ink bg-ink text-white' : 'border-line'
            }`}
            onClick={() => setRange(null, null)}
          >
            제한 없음
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-ink-2">고정 조건</span>
        {prefs.fixedRules.length === 0 && <span className="text-xs text-ink-3">없음</span>}
        {prefs.fixedRules.map((r) => {
          const label = fixedRuleLabel(r)
          return (
            <div key={r.id} className="flex items-center gap-2">
              <div className={`flex min-w-0 flex-1 flex-col ${r.enabled ? '' : 'opacity-50'}`}>
                <span className="font-bold">{label}</span>
                <span className="text-[11.5px] text-ink-2">
                  매주 {WEEK[r.weekday]}요일 {r.shift === 'ANY' ? '근무' : r.shift}
                  {r.type === 'require' ? ' 배정' : ' 배정 안 함'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={r.enabled}
                aria-label={label}
                onClick={() =>
                  setRules(prefs.fixedRules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))
                }
                className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                  r.enabled ? 'bg-primary' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
                    r.enabled ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
              <button
                type="button"
                aria-label={`${label} 삭제`}
                className="cursor-pointer px-1 text-base leading-none text-ink-3 hover:text-danger"
                onClick={() => setRules(prefs.fixedRules.filter((x) => x.id !== r.id))}
              >
                ×
              </button>
            </div>
          )
        })}
        {adding ? (
          <div className="flex flex-col gap-1.5 rounded-lg bg-panel p-2">
            <div className="flex gap-1">
              <select
                aria-label="요일"
                className={sel}
                value={form.weekday}
                onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))}
              >
                {WEEK.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
              <select
                aria-label="근무"
                className={sel}
                value={form.shift}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shift: e.target.value as DoctorFixedRule['shift'] }))
                }
              >
                <option value="D">Day</option>
                <option value="N">Night</option>
                <option value="ANY">근무</option>
              </select>
              <select
                aria-label="필수/금지"
                className={sel}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DoctorFixedRule['type'] }))}
              >
                <option value="require">필수</option>
                <option value="forbid">금지</option>
              </select>
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs"
                onClick={() => setAdding(false)}
              >
                취소
              </button>
              <button
                type="button"
                disabled={pending}
                className="h-8 cursor-pointer rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-50"
                onClick={addRule}
              >
                추가
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="h-8 cursor-pointer rounded-lg border border-dashed border-line text-xs font-semibold text-ink-2 hover:bg-panel"
            onClick={() => setAdding(true)}
          >
            + 조건 추가 <span className="font-normal text-ink-3">(요일 × D/N/근무 × 필수/금지)</span>
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="text-xs text-danger">
          {error}
        </div>
      )}
    </section>
  )
}

const str = (n: number | null) => (n === null ? '' : String(n))
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Math.trunc(Number(s)))
