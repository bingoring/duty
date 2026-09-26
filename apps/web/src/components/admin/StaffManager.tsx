'use client'

import { useState, useTransition } from 'react'
import {
  adjustBalancesAction,
  createStaffAction,
  reissuePasswordAction,
  removeStaffAction,
  updateStaffAction,
} from '@/server/admin/actions'
import type { StaffRow } from '@/server/staff/service'
import { Dialog, Field, btnPrimary, btnSecondary, inputCls, useHydrated } from './ui'

// S10 간호사 관리 (Build Spec 2-4 frontend-components §2, 핸드오프 1k)
type Params = { trainingMonths: number; newbieTripleWeeks: number; experiencedTripleWeeks: number }
type Errors = Partial<Record<string, string>>
type TrainingForm = {
  on: boolean
  kind: 'new_grad' | 'experienced'
  preceptorId: string
  tripleWeeks: number
}

const TIERS = [
  ['senior', '고연차'],
  ['mid', '중간연차'],
  ['junior', '저연차'],
] as const

const ACCOUNTS = [
  ['annual_leave', '연차'],
  ['special_leave', '특별휴가'],
  ['founding_off', '개원오프'],
  ['checkup', '검진 반차'],
  ['sick_leave', '병가'],
  ['off_carry', '누적 OFF'],
  ['night_bank', '잔여 N'],
] as const

type Dlg =
  | { kind: 'temp'; name: string; employeeNo: string; password: string }
  | { kind: 'edit'; row: StaffRow }
  | { kind: 'remove'; row: StaffRow }
  | null

function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly (readonly [T, string])[]
  label?: string
}) {
  return (
    <select
      aria-label={label}
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

function TrainingFields({
  t,
  set,
  preceptors,
  params,
  errors,
}: {
  t: TrainingForm
  set: (t: TrainingForm) => void
  preceptors: StaffRow[]
  params: Params
  errors: Errors
}) {
  const weeksFor = (k: TrainingForm['kind']) =>
    k === 'new_grad' ? params.newbieTripleWeeks : params.experiencedTripleWeeks
  return (
    <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          className="accent-primary"
          checked={t.on}
          onChange={(e) => set({ ...t, on: e.target.checked })}
        />
        신규 간호사 · 트레이닝 {params.trainingMonths}개월
      </label>
      {t.on && (
        <>
          <div className="flex gap-4">
            {(
              [
                ['new_grad', '완전 신규'],
                ['experienced', '경력자(타 병원)'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={t.kind === k}
                  onChange={() => set({ ...t, kind: k, tripleWeeks: weeksFor(k) })}
                />
                {l}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="프리셉터" error={errors.preceptorId}>
              <select
                aria-label="프리셉터"
                className={inputCls}
                value={t.preceptorId}
                onChange={(e) => set({ ...t, preceptorId: e.target.value })}
              >
                <option value="">선택</option>
                {preceptors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="3인 배정 기간(주)">
              <input
                type="number"
                min={0}
                max={12}
                className={inputCls}
                value={t.tripleWeeks}
                onChange={(e) => set({ ...t, tripleWeeks: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="text-xs leading-[1.5] text-ink-2">
            트레이닝 중 프리셉터와 동일 근무로 배정되며, 첫 {t.tripleWeeks}주(변경 가능)와 그 뒤 처음 서는
            나이트는 해당 듀티 인원을 3인으로 계산합니다.
          </div>
        </>
      )}
    </div>
  )
}

const trainingPayload = (t: TrainingForm) =>
  t.on ? { training: { kind: t.kind, preceptorId: t.preceptorId, tripleWeeks: t.tripleWeeks } } : {}

function AddPanel({
  preceptors,
  params,
  onCreated,
}: {
  preceptors: StaffRow[]
  params: Params
  onCreated: (d: Dlg) => void
}) {
  const empty = {
    employeeNo: '',
    name: '',
    hireDate: '',
    kTass: false,
    seniorityTier: 'junior' as (typeof TIERS)[number][0],
    unionMember: false,
    rotation: 'rotating' as 'rotating' | 'fixed_weekday',
    admin: false,
    annualLeave: '0',
    nightBank: '0',
    offCarry: '0',
  }
  const [f, setF] = useState(empty)
  const [t, setT] = useState<TrainingForm>({
    on: false,
    kind: 'new_grad',
    preceptorId: '',
    tripleWeeks: params.newbieTripleWeeks,
  })
  const [errors, setErrors] = useState<Errors>({})
  const [pending, start] = useTransition()
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  const submit = () =>
    start(async () => {
      const r = await createStaffAction({
        ...f,
        role: f.admin ? 'admin' : 'nurse',
        ...trainingPayload(t),
      })
      if (r.ok) {
        onCreated({ kind: 'temp', name: f.name, employeeNo: f.employeeNo.trim(), password: r.tempPassword })
        setF(empty)
        setT({ ...t, on: false })
        setErrors({})
      } else setErrors('errors' in r && r.errors ? r.errors : { form: 'message' in r ? r.message : '' })
    })

  return (
    <aside
      id="staff-add"
      aria-label="간호사 추가"
      className="flex flex-col gap-3.5 rounded-[14px] border border-ink bg-surface p-[22px] text-[13px]"
    >
      <div className="text-base font-bold">간호사 추가</div>
      {errors.form && <div className="rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">{errors.form}</div>}
      <Field label="사번" required error={errors.employeeNo}>
        <input
          className={`${inputCls} border-ink`}
          value={f.employeeNo}
          onChange={(e) => set('employeeNo', e.target.value)}
        />
      </Field>
      <Field label="성명" error={errors.name}>
        <input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="입사일" error={errors.hireDate}>
          <input
            type="date"
            className={inputCls}
            value={f.hireDate}
            onChange={(e) => set('hireDate', e.target.value)}
          />
        </Field>
        <Field label="K-tass 권한">
          <Select
            label="K-tass 권한"
            value={f.kTass ? 'y' : 'n'}
            onChange={(v) => set('kTass', v === 'y')}
            options={[
              ['n', '없음'],
              ['y', '있음'],
            ]}
          />
        </Field>
        <Field label="연차 구분">
          <Select
            label="연차 구분"
            value={f.seniorityTier}
            onChange={(v) => set('seniorityTier', v)}
            options={TIERS}
          />
        </Field>
        <Field label="근무 방식">
          <Select
            label="근무 방식"
            value={f.rotation}
            onChange={(v) => set('rotation', v)}
            options={[
              ['rotating', '교대'],
              ['fixed_weekday', '평일 고정'],
            ]}
          />
        </Field>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-primary"
            checked={f.unionMember}
            onChange={(e) => set('unionMember', e.target.checked)}
          />
          노조
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-primary"
            checked={f.admin}
            onChange={(e) => set('admin', e.target.checked)}
          />
          관리자 권한
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['annualLeave', '연차'],
            ['nightBank', '잔여 N'],
            ['offCarry', '이월 오프'],
          ] as const
        ).map(([k, l]) => (
          <Field key={k} label={l} error={errors[k]}>
            <input
              type="number"
              step="0.5"
              className={inputCls}
              value={f[k]}
              onChange={(e) => set(k, e.target.value)}
            />
          </Field>
        ))}
      </div>
      <div className="text-xs text-ink-2">특별휴가(재직 일수 산식)·검진 반차·병가는 자동으로 부여됩니다.</div>
      <TrainingFields t={t} set={setT} preceptors={preceptors} params={params} errors={errors} />
      <div className="mt-auto flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={() => (setF(empty), setErrors({}))}>
          취소
        </button>
        <button type="button" className={btnPrimary} disabled={pending} onClick={submit}>
          추가 · 초기 비밀번호 발급
        </button>
      </div>
    </aside>
  )
}

function EditDialog({
  row,
  preceptors,
  params,
  onClose,
}: {
  row: StaffRow
  preceptors: StaffRow[]
  params: Params
  onClose: () => void
}) {
  const [f, setF] = useState({
    name: row.name,
    hireDate: row.hireDate ?? '',
    kTass: row.kTass,
    seniorityTier: row.seniorityTier,
    unionMember: row.unionMember,
    rotation: row.rotation,
    admin: row.role === 'admin',
    seniorityRank: row.seniorityRank,
  })
  const [t, setT] = useState<TrainingForm>(
    row.training
      ? {
          on: true,
          kind: row.training.kind,
          preceptorId: row.training.preceptorId,
          tripleWeeks: Math.round(
            (Date.parse(row.training.tripleStaffUntil) - Date.parse(row.training.startDate)) /
              86_400_000 /
              7 +
              1 / 7,
          ),
        }
      : { on: false, kind: 'new_grad', preceptorId: '', tripleWeeks: params.newbieTripleWeeks },
  )
  const [bal, setBal] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  const save = () =>
    start(async () => {
      const r = await updateStaffAction(row.id, {
        ...f,
        role: f.admin ? 'admin' : 'nurse',
        ...trainingPayload(t),
      })
      if (r.ok) onClose()
      else setErrors(r.errors ?? { form: r.message ?? '' })
    })
  const saveBalances = () =>
    start(async () => {
      const values = Object.fromEntries(
        Object.entries(bal)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, Number(v)]),
      )
      const r = await adjustBalancesAction({ userId: row.id, values, note })
      if (r.ok) {
        setMsg('잔여치를 조정했습니다.')
        setBal({})
        setNote('')
      } else setErrors(r.errors ?? { form: r.message ?? '' })
    })

  return (
    <Dialog title={`${row.name} · 수정`} onClose={onClose} width={560}>
      {errors.form && <div className="rounded-lg bg-danger-bg px-3 py-2 text-danger-ink">{errors.form}</div>}
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="성명" error={errors.name}>
          <input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="사번">
          <input className={`${inputCls} bg-panel`} value={row.employeeNo} readOnly />
        </Field>
        <Field label="입사일" error={errors.hireDate}>
          <input
            type="date"
            className={inputCls}
            value={f.hireDate}
            onChange={(e) => set('hireDate', e.target.value)}
          />
        </Field>
        <Field label="표 순서">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={f.seniorityRank}
            onChange={(e) => set('seniorityRank', Number(e.target.value))}
          />
        </Field>
        <Field label="연차 구분">
          <Select
            label="연차 구분"
            value={f.seniorityTier}
            onChange={(v) => set('seniorityTier', v)}
            options={TIERS}
          />
        </Field>
        <Field label="근무 방식">
          <Select
            label="근무 방식"
            value={f.rotation}
            onChange={(v) => set('rotation', v)}
            options={[
              ['rotating', '교대'],
              ['fixed_weekday', '평일 고정'],
            ]}
          />
        </Field>
      </div>
      <div className="flex gap-4">
        {(
          [
            ['kTass', 'K-tass'],
            ['unionMember', '노조'],
            ['admin', '관리자 권한'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="accent-primary"
              checked={f[k]}
              onChange={(e) => set(k, e.target.checked)}
            />
            {l}
          </label>
        ))}
      </div>
      <TrainingFields
        t={t}
        set={setT}
        preceptors={preceptors.filter((p) => p.id !== row.id)}
        params={params}
        errors={errors}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          닫기
        </button>
        <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
          저장
        </button>
      </div>

      <section aria-label="잔여치 조정" className="flex flex-col gap-2 border-t border-line-soft pt-3">
        <div className="font-bold">잔여치 조정</div>
        <div className="text-xs text-ink-2">
          현재값은 원장 합계입니다(마감하지 않은 달의 사용분은 빠져 있음). 바꿀 항목만 새 값을 입력하세요.
        </div>
        <div className="grid grid-cols-[1fr_80px_90px] items-center gap-x-3 gap-y-1.5">
          {ACCOUNTS.map(([k, l]) => (
            <div key={k} className="contents">
              <span>{l}</span>
              <span className="text-ink-2">현재 {row.balances[k]}</span>
              <input
                aria-label={`${l} 새 값`}
                type="number"
                step="0.5"
                className="h-8 rounded-md border border-line px-2"
                value={bal[k] ?? ''}
                onChange={(e) => setBal({ ...bal, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Field label="메모" error={errors.note}>
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 초기 입력 정정"
          />
        </Field>
        {msg && (
          <div role="status" className="text-primary">
            {msg}
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" className={btnSecondary} disabled={pending} onClick={saveBalances}>
            조정 저장
          </button>
        </div>
      </section>
    </Dialog>
  )
}

export function StaffManager({
  rows,
  params,
  notice,
}: {
  rows: StaffRow[]
  params: Params
  notice: string | null
}) {
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState<Dlg>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const hydrated = useHydrated()
  const preceptors = rows.filter((r) => r.rotation === 'rotating')
  const shown = rows.filter((r) => !q || r.name.includes(q.trim()) || r.employeeNo.includes(q.trim()))

  const reissue = (row: StaffRow) =>
    start(async () => {
      setMenu(null)
      const r = await reissuePasswordAction(row.id)
      if (r.ok) setDlg({ kind: 'temp', name: row.name, employeeNo: row.employeeNo, password: r.tempPassword })
    })
  const remove = (row: StaffRow) =>
    start(async () => {
      const r = await removeStaffAction(row.id)
      setDlg(null)
      setError(r.ok ? '' : (r.message ?? ''))
    })

  return (
    <div data-hydrated={hydrated || undefined} className="grid min-w-0 grid-cols-[1fr_380px] gap-5 px-7 py-6">
      <div className="flex min-w-0 flex-col gap-3.5">
        {notice && (
          <div className="rounded-lg bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">{notice}</div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">간호사 관리 · 응급실 {rows.length}명</h1>
          <input
            aria-label="이름 · 사번 검색"
            placeholder="이름 · 사번 검색"
            className="ml-auto h-9 w-[220px] rounded-lg border border-line px-3 text-[13px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="h-9 cursor-pointer rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white"
            onClick={() => document.querySelector<HTMLInputElement>('#staff-add input')?.focus()}
          >
            + 간호사 추가
          </button>
        </div>
        {error && (
          <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger-ink">
            {error}
          </div>
        )}
        <div className="overflow-visible rounded-xl border border-line bg-surface text-[13px]">
          <div className="grid grid-cols-[1.2fr_1.2fr_.8fr_.8fr_1fr_1.4fr_.6fr] border-b border-line bg-panel px-4 py-2.5 text-xs text-ink-2">
            <span>성명</span>
            <span>사번</span>
            <span>연차(년)</span>
            <span>K-tass</span>
            <span>역할</span>
            <span>트레이닝</span>
            <span />
          </div>
          {shown.map((r) => (
            <div
              key={r.id}
              role="row"
              aria-label={r.name}
              className="relative grid grid-cols-[1.2fr_1.2fr_.8fr_.8fr_1fr_1.4fr_.6fr] items-center border-b border-line-soft px-4 py-[11px]"
            >
              <span className="font-semibold">{r.name}</span>
              <span className="text-ink-2">{r.employeeNo}</span>
              <span>{r.years ?? '—'}</span>
              <span className={r.kTass ? 'font-semibold text-primary' : 'text-ink-4'}>
                {r.kTass ? 'K-tass' : '—'}
              </span>
              <span
                className={
                  r.roleLabel === '수간호사 · 관리자'
                    ? 'font-semibold text-admin'
                    : r.roleLabel === '신규'
                      ? 'font-semibold text-danger'
                      : ''
                }
              >
                {r.roleLabel}
              </span>
              <span className="text-ink-2">{r.trainingText}</span>
              <button
                type="button"
                aria-label={`${r.name} 메뉴`}
                className="cursor-pointer text-right text-ink-2"
                onClick={() => setMenu(menu === r.id ? null : r.id)}
              >
                ···
              </button>
              {menu === r.id && (
                <div className="absolute top-9 right-4 z-10 flex w-36 flex-col rounded-lg border border-line bg-surface py-1 shadow-popover">
                  {(
                    [
                      ['수정', () => (setMenu(null), setDlg({ kind: 'edit', row: r }))],
                      ['비밀번호 재발급', () => reissue(r)],
                      ['제거', () => (setMenu(null), setDlg({ kind: 'remove', row: r }))],
                    ] as const
                  ).map(([l, fn]) => (
                    <button
                      key={l}
                      type="button"
                      disabled={pending}
                      className={`cursor-pointer px-3 py-2 text-left hover:bg-panel ${l === '제거' ? 'text-danger' : ''}`}
                      onClick={fn}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <AddPanel preceptors={preceptors} params={params} onCreated={setDlg} />

      {dlg?.kind === 'temp' && (
        <Dialog title="임시 비밀번호" onClose={() => setDlg(null)}>
          <div>
            {dlg.name}({dlg.employeeNo}) 계정의 임시 비밀번호입니다.
          </div>
          <div
            className="rounded-lg bg-panel px-4 py-3 text-center font-mono text-2xl font-extrabold tracking-wider"
            data-testid="temp-password"
          >
            {dlg.password}
          </div>
          <div className="text-xs text-ink-2">
            이 창을 닫으면 다시 볼 수 없습니다. 첫 로그인 때 비밀번호를 바꾸게 됩니다.
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => navigator.clipboard?.writeText(dlg.password)}
            >
              복사
            </button>
            <button type="button" className={btnPrimary} onClick={() => setDlg(null)}>
              확인
            </button>
          </div>
        </Dialog>
      )}
      {dlg?.kind === 'edit' && (
        <EditDialog row={dlg.row} preceptors={preceptors} params={params} onClose={() => setDlg(null)} />
      )}
      {dlg?.kind === 'remove' && (
        <Dialog title="간호사 제거" onClose={() => setDlg(null)}>
          <div>
            <b>{dlg.row.name}</b>({dlg.row.employeeNo})을 제거할까요? 과거 근무표와 잔여치 기록은 보존되고,
            이후 근무 생성에서 빠집니다. 로그인도 즉시 해제됩니다.
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setDlg(null)}>
              취소
            </button>
            <button
              type="button"
              className={`${btnPrimary} bg-danger hover:bg-danger`}
              disabled={pending}
              onClick={() => remove(dlg.row)}
            >
              제거
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
