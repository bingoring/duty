'use client'

import {
  RULE_PARAM_LIMITS,
  RULE_TOGGLE_DEFS,
  normalizePattern,
  type RuleParams,
  type RuleSet,
  type RuleToggles,
} from '@duty/domain'
import { useState, useTransition } from 'react'
import { saveRulesAction } from '@/server/admin/actions'
import type { RuleEditor } from '@/server/rules/service'
import { useHydrated } from './ui'

// S11 관리자 · 규칙 설정 (Build Spec 2-4 frontend-components §2, 핸드오프 2b)
const KIND_CLS = {
  필수: 'bg-primary-soft text-primary',
  권고: 'bg-warn-bg text-warn-ink',
  운영: 'bg-line-soft text-ink-2',
}
const stepBtn = 'h-[34px] w-[30px] cursor-pointer rounded-lg border border-line bg-surface text-sm'

function NumberInput({
  value,
  changed,
  onChange,
  label,
}: {
  value: number
  changed: boolean
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label} 줄이기`}
        className={stepBtn}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        className={`h-[34px] w-16 rounded-lg border text-center text-[15px] font-bold ${
          changed ? 'border-admin bg-admin-soft' : 'border-line'
        }`}
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
      />
      <button
        type="button"
        aria-label={`${label} 늘리기`}
        className={stepBtn}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

export function RulesForm({ editor }: { editor: RuleEditor }) {
  const [rules, setRules] = useState<RuleSet>(editor.rules)
  const [newPattern, setNewPattern] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [message, setMessage] = useState('')
  const [pending, start] = useTransition()
  const hydrated = useHydrated()
  const base = editor.rules
  const setParam = (k: keyof RuleParams, v: number) =>
    setRules({ ...rules, params: { ...rules.params, [k]: v } })
  const setToggle = (k: keyof RuleToggles, v: boolean) =>
    setRules({ ...rules, toggles: { ...rules.toggles, [k]: v } })
  const paramChanged = (k: keyof RuleParams) => rules.params[k] !== base.params[k]
  const patternsChanged =
    [...rules.forbiddenPatterns].sort().join() !== [...base.forbiddenPatterns].sort().join()
  const changes =
    (Object.keys(rules.params) as (keyof RuleParams)[]).filter(paramChanged).length +
    (Object.keys(rules.toggles) as (keyof RuleToggles)[]).filter((k) => rules.toggles[k] !== base.toggles[k])
      .length +
    (patternsChanged ? 1 : 0)

  const save = () =>
    start(async () => {
      const r = await saveRulesAction({ rules, baseVersion: editor.version })
      if (r.ok) {
        setErrors({})
        setMessage(`저장했습니다 (버전 ${r.version}).`)
      } else {
        setErrors(r.errors ?? {})
        setMessage(r.message ?? '입력을 확인해 주세요.')
      }
    })

  const groups = [...new Set(RULE_PARAM_LIMITS.map((l) => l.group))]
  return (
    <div data-hydrated={hydrated || undefined} className="grid min-w-0 grid-cols-[1fr_340px] gap-5">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">규칙 설정 · 응급실</h1>
          {changes > 0 && (
            <span className="rounded-full bg-admin-soft px-2 py-[3px] text-xs font-semibold text-admin">
              변경 {changes}건 저장 전
            </span>
          )}
          <span className="ml-auto text-xs text-ink-2">
            다음 듀티 생성({editor.applyFromMonth}월)부터 적용
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface text-[13px]">
          {groups.map((g) => (
            <div key={g}>
              <div className="bg-panel px-4 py-2.5 text-xs font-semibold text-ink-3">{g}</div>
              {RULE_PARAM_LIMITS.filter((l) => l.group === g).map((l) => {
                const range = l.key === 'negotiationStartDay'
                const changed = paramChanged(l.key) || (range && paramChanged('negotiationEndDay'))
                return (
                  <div
                    key={l.key}
                    data-rule={l.key}
                    className={`grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line-soft px-4 py-3 ${changed ? 'bg-admin-row' : ''}`}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{l.label}</span>
                        <span
                          className={`flex-none rounded-full px-[7px] py-0.5 text-[10.5px] font-bold ${KIND_CLS[l.kind]}`}
                        >
                          {l.kind}
                        </span>
                        {changed && (
                          <span className="text-[11px] font-semibold text-admin">
                            {range
                              ? `${base.params.negotiationStartDay}–${base.params.negotiationEndDay} → ${rules.params.negotiationStartDay}–${rules.params.negotiationEndDay}`
                              : `${base.params[l.key]} → ${rules.params[l.key]}`}{' '}
                            변경, 저장 전
                          </span>
                        )}
                      </div>
                      {l.desc && <span className="text-xs text-ink-2">{l.desc}</span>}
                      {errors[l.key] && <span className="text-xs text-danger">{errors[l.key]}</span>}
                      {range && errors.negotiationEndDay && (
                        <span className="text-xs text-danger">{errors.negotiationEndDay}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <NumberInput
                        label={l.label}
                        value={rules.params[l.key]}
                        changed={paramChanged(l.key)}
                        onChange={(v) => setParam(l.key, v)}
                      />
                      {range && (
                        <>
                          <span>–</span>
                          <NumberInput
                            label="협의 수정 기간 끝"
                            value={rules.params.negotiationEndDay}
                            changed={paramChanged('negotiationEndDay')}
                            onChange={(v) => setParam('negotiationEndDay', v)}
                          />
                        </>
                      )}
                      <span className="w-11 text-xs text-ink-2">{l.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 text-[13px]">
          <div className="font-bold">켜고 끄는 규칙</div>
          {RULE_TOGGLE_DEFS.map((t) => (
            <label key={t.key} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-[3px] accent-primary"
                checked={rules.toggles[t.key]}
                onChange={(e) => setToggle(t.key, e.target.checked)}
              />
              <span>
                <b>{t.label}</b>
                <br />
                <span className="text-xs text-ink-2">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 text-[13px]">
          <div className="font-bold">금지 근무 패턴</div>
          <div className="flex flex-wrap gap-1.5">
            {rules.forbiddenPatterns.map((p) => (
              <button
                key={p}
                type="button"
                aria-label={`${p} 삭제`}
                className="cursor-pointer rounded-md bg-danger-bg px-2.5 py-[5px] text-xs font-bold text-danger-ink"
                onClick={() =>
                  setRules({ ...rules, forbiddenPatterns: rules.forbiddenPatterns.filter((x) => x !== p) })
                }
              >
                {p} ×
              </button>
            ))}
            {newPattern === null ? (
              <button
                type="button"
                className="cursor-pointer rounded-md border border-dashed border-ink-5 px-2.5 py-[5px] text-xs text-ink-2"
                onClick={() => setNewPattern('')}
              >
                + 패턴 추가
              </button>
            ) : (
              <input
                autoFocus
                aria-label="새 금지 패턴"
                placeholder="예: N-S"
                className="h-7 w-24 rounded-md border border-line px-2 text-xs"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPattern.trim()) {
                    const p = normalizePattern(newPattern)
                    if (!rules.forbiddenPatterns.includes(p))
                      setRules({ ...rules, forbiddenPatterns: [...rules.forbiddenPatterns, p] })
                    setNewPattern(null)
                  } else if (e.key === 'Escape') setNewPattern(null)
                }}
              />
            )}
          </div>
          {errors.forbiddenPatterns && (
            <span className="text-xs text-danger">{errors.forbiddenPatterns}</span>
          )}
        </div>
        <div className="rounded-xl border border-dashed border-line bg-panel p-3.5 text-xs leading-[1.6] text-ink-2">
          <b className="text-ink">변경 이력</b>
          {editor.history.map((h) =>
            h.lines.map((line, i) => (
              <div key={`${h.version}-${i}`}>
                {h.date} {h.who} · {line}
              </div>
            )),
          )}
        </div>
        {message && (
          <div role="status" className="text-[13px] text-ink-2">
            {message}
          </div>
        )}
        <div className="mt-auto flex gap-2">
          <button
            type="button"
            className="h-11 flex-1 cursor-pointer rounded-[10px] border border-line bg-surface text-sm"
            onClick={() => (setRules(base), setErrors({}), setMessage(''))}
          >
            되돌리기
          </button>
          <button
            type="button"
            disabled={pending || changes === 0}
            className="h-11 flex-[1.4] cursor-pointer rounded-[10px] bg-primary text-sm font-bold text-white disabled:cursor-default disabled:opacity-50"
            onClick={save}
          >
            저장 · 규칙 안내 반영
          </button>
        </div>
      </aside>
    </div>
  )
}
