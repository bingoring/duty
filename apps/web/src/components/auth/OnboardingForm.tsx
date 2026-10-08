'use client'

import {
  addDays,
  defaultTrainingEnd,
  employedDaysInYear,
  specialLeaveDays,
  type RuleParams,
} from '@duty/domain'
import { useState, useTransition } from 'react'
import { saveOnboardingAction } from '@/server/onboarding/actions'
import type { OnboardingValues, OnboardingView } from '@/server/onboarding/service'
import { useHydrated } from '../admin/ui'
import { ErrorBox } from './ErrorBox'

// Build Spec 2-11 frontend-components OnboardingPage — 섹션 3개(인적 사항 · 잔여 · 신규 트레이닝) 또는 연차 한 칸
type Key = keyof OnboardingValues
const TIERS = [
  ['senior', '고연차'],
  ['mid', '중간연차'],
  ['junior', '저연차'],
] as const
const input =
  'h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-primary'
const seg = (on: boolean) =>
  `h-10 flex-1 cursor-pointer rounded-lg text-[13px] ${on ? 'border-2 border-ink font-bold' : 'border border-line bg-surface text-ink-2'}`

// 바뀐 칸 왼쪽 3px warn 바 + "처음 값" (폼 밖에 둬야 입력 중 다시 그려도 포커스를 잃지 않는다)
function Field(p: {
  k: Key
  label: string
  hint?: string
  first?: string
  changed: boolean
  error: string | undefined
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 ${p.changed ? 'border-l-[3px] border-warn-dot pl-2.5' : ''}`}
      data-field={p.k}
    >
      <span className="text-[13px] font-semibold">{p.label}</span>
      {p.children}
      {p.hint && <span className="text-[11px] text-ink-3">{p.hint}</span>}
      {p.changed && p.first !== undefined && (
        <span className="text-[11px] text-warn-ink">처음 값: {p.first}</span>
      )}
      {p.error && <span className="text-xs text-danger">{p.error}</span>}
    </div>
  )
}

export function OnboardingForm({ view, params }: { view: OnboardingView; params: RuleParams }) {
  const [v, setV] = useState<OnboardingValues>(view.values)
  const [err, setErr] = useState<{ message: string; field?: string } | null>(null)
  const [pending, start] = useTransition()
  const has = (k: Key) => view.fields.includes(k)
  const set = <K extends Key>(k: K, x: OnboardingValues[K]) => setV((p) => ({ ...p, [k]: x }))
  const changed = (k: Key) => JSON.stringify(v[k]) !== JSON.stringify(view.values[k])

  const fieldProps = (k: Key) => ({
    k,
    changed: changed(k),
    error: err?.field === k ? err.message : undefined,
  })
  const yesNo = (k: 'kTass' | 'unionMember', label: string) => (
    <Field {...fieldProps(k)} label={label} first={view.values[k] ? '예' : '아니오'}>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[true, false].map((b) => (
          <button
            key={String(b)}
            type="button"
            role="radio"
            aria-checked={v[k] === b}
            className={seg(v[k] === b)}
            onClick={() => set(k, b)}
          >
            {b ? '예' : '아니오'}
          </button>
        ))}
      </div>
    </Field>
  )
  const num = (k: 'annual' | 'nightBank' | 'offCarry', label: string, hint: string, step: number) => (
    <Field {...fieldProps(k)} label={label} hint={hint} first={String(view.values[k])}>
      <input
        aria-label={label}
        type="number"
        step={step}
        value={Number.isNaN(v[k]) ? '' : v[k]}
        onChange={(e) => set(k, e.target.value === '' ? NaN : Number(e.target.value))}
        className={`${input} h-[52px] text-[22px] font-bold`}
      />
    </Field>
  )
  const startTraining = (kind: 'new_grad' | 'experienced', startDate: string) => {
    const weeks = kind === 'new_grad' ? params.newbieTripleWeeks : params.experiencedTripleWeeks
    const endDate = defaultTrainingEnd(startDate, params)
    const triple = addDays(startDate, 7 * weeks - 1)
    return { startDate, endDate, tripleStaffUntil: triple > endDate ? endDate : triple }
  }
  const t = v.training
  const special = v.hireDate ? specialLeaveDays(employedDaysInYear(view.year, v.hireDate, null)) : null

  const save = () =>
    start(async () => {
      setErr(null)
      const body = Object.fromEntries(view.fields.map((k) => [k, v[k]]))
      const r = await saveOnboardingAction(body)
      if (r && !r.ok) setErr({ message: r.message, ...(r.field ? { field: r.field } : {}) })
    })

  const hydrated = useHydrated()
  return (
    <div data-hydrated={hydrated || undefined} className="flex flex-col gap-5">
      {err && !err.field && <ErrorBox>{err.message}</ErrorBox>}
      {view.mode === 'initial' && (
        <section aria-label="인적 사항" className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Field {...fieldProps('hireDate')} label="입사일" first={view.values.hireDate ?? '—'}>
            <input
              aria-label="입사일"
              type="date"
              value={v.hireDate ?? ''}
              onChange={(e) => set('hireDate', e.target.value || null)}
              className={input}
            />
          </Field>
          {has('seniorityTier') && (
            <Field
              {...fieldProps('seniorityTier')}
              label="연차 구분"
              first={TIERS.find((x) => x[0] === view.values.seniorityTier)?.[1]}
            >
              <div className="flex gap-1.5" role="radiogroup" aria-label="연차 구분">
                {TIERS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={v.seniorityTier === k}
                    className={seg(v.seniorityTier === k)}
                    onClick={() => set('seniorityTier', k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {yesNo('kTass', 'K-tass 자격')}
          {yesNo('unionMember', '노조 가입')}
          {has('nightDedicated') && (
            <div className="col-span-2">
              <Field
                {...fieldProps('nightDedicated')}
                label="근무 방식"
                first={view.values.nightDedicated ? '야간 전담' : '교대 근무'}
              >
                {view.nightDedicatedOn ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1.5" role="radiogroup" aria-label="근무 방식">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!v.nightDedicated}
                        className={seg(!v.nightDedicated)}
                        onClick={() => set('nightDedicated', null)}
                      >
                        교대 근무
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!!v.nightDedicated}
                        className={seg(!!v.nightDedicated)}
                        onClick={() =>
                          set(
                            'nightDedicated',
                            v.nightDedicated ?? { from: `${view.year}-01-01`, to: `${view.year}-06-30` },
                          )
                        }
                      >
                        야간 전담
                      </button>
                    </div>
                    {v.nightDedicated && (
                      <div className="flex items-center gap-2 text-[13px]">
                        <input
                          aria-label="야간 전담 시작"
                          type="date"
                          value={v.nightDedicated.from}
                          onChange={(e) =>
                            set('nightDedicated', { ...v.nightDedicated!, from: e.target.value })
                          }
                          className={input}
                        />
                        ~
                        <input
                          aria-label="야간 전담 종료"
                          type="date"
                          value={v.nightDedicated.to}
                          onChange={(e) =>
                            set('nightDedicated', { ...v.nightDedicated!, to: e.target.value })
                          }
                          className={input}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-ink-2">교대 근무 (응급실은 야간 전담이 없습니다)</span>
                )}
              </Field>
            </div>
          )}
        </section>
      )}

      <section aria-label="잔여" className="flex flex-col gap-3 border-t border-line-soft pt-4">
        <div className={`grid gap-3 ${has('nightBank') ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {num('annual', `연차 (${view.year}년)`, '매년 1월 1일 초기화', 0.5)}
          {has('nightBank') &&
            num('nightBank', '잔여 나이트', `${view.monthLabel} 기준 · 6개마다 슬리핑오프 1`, 1)}
          {has('offCarry') &&
            num('offCarry', '이월 오프', `${view.monthLabel} 기준 · 음수면 반납할 오프`, 0.5)}
        </div>
        {view.mode === 'initial' && (
          <div className="grid grid-cols-2 gap-3 text-[13px] text-ink-2">
            <span>특별휴가 {special === null ? '—' : `${special}일`} · 근무일수로 자동 계산</span>
            <span>검진 반차 0.5 · 해마다 자동 부여</span>
          </div>
        )}
      </section>

      {has('training') && (
        <section aria-label="신규 트레이닝" className="flex flex-col gap-3 border-t border-line-soft pt-4">
          <Field
            {...fieldProps('training')}
            label="신규 간호사인가요?"
            first={view.values.training ? '예' : '아니오'}
          >
            <div className="flex gap-1.5" role="radiogroup" aria-label="신규 간호사">
              <button
                type="button"
                role="radio"
                aria-checked={!!t}
                className={seg(!!t)}
                onClick={() =>
                  set(
                    'training',
                    t ?? {
                      kind: 'new_grad',
                      preceptorId: '',
                      ...startTraining('new_grad', v.hireDate ?? `${view.year}-01-01`),
                    },
                  )
                }
              >
                예
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!t}
                className={seg(!t)}
                onClick={() => set('training', null)}
              >
                아니오
              </button>
            </div>
          </Field>
          {t && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                구분
                <select
                  aria-label="구분"
                  value={t.kind}
                  onChange={(e) => {
                    const kind = e.target.value as 'new_grad' | 'experienced'
                    set('training', { ...t, kind, ...startTraining(kind, t.startDate) })
                  }}
                  className={input}
                >
                  <option value="new_grad">완전 신규</option>
                  <option value="experienced">경력자</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                프리셉터
                <select
                  aria-label="프리셉터"
                  value={t.preceptorId}
                  onChange={(e) => set('training', { ...t, preceptorId: e.target.value })}
                  className={input}
                >
                  <option value="">선택</option>
                  {view.preceptors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                트레이닝 시작
                <input
                  aria-label="트레이닝 시작"
                  type="date"
                  value={t.startDate}
                  onChange={(e) =>
                    e.target.value && set('training', { ...t, ...startTraining(t.kind, e.target.value) })
                  }
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                트레이닝 종료
                <input
                  aria-label="트레이닝 종료"
                  type="date"
                  value={t.endDate}
                  onChange={(e) => set('training', { ...t, endDate: e.target.value })}
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                3인 근무 종료
                <input
                  aria-label="3인 근무 종료"
                  type="date"
                  value={t.tripleStaffUntil}
                  onChange={(e) => set('training', { ...t, tripleStaffUntil: e.target.value })}
                  className={input}
                />
                <span className="text-[11px] font-normal text-ink-3">
                  처음 몇 주는 근무 인원을 3인으로 배정합니다
                </span>
              </label>
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="h-12 cursor-pointer rounded-[10px] bg-primary text-[15px] font-bold text-white hover:bg-primary-hover disabled:cursor-default disabled:opacity-70"
      >
        {pending ? '저장 중…' : '저장하고 근무표 보기'}
      </button>
    </div>
  )
}
