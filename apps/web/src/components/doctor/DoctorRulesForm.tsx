'use client'

// 3-7a 의사 규칙 설정 — 의사별 D·N 개수(30일 달 기준), 신청 마감일·조정 마감일. 저장하면 새 규칙 버전
// 3-11 6/7: 오른쪽 「규칙 안내」 패널에서 규칙마다 필수/권고를 고른다(매일 인원·재직 기간은 늘 필수)
// 3-11 10: 금지 패턴 목록(추가·삭제·필수/권고) — 폼과 함께 저장
import {
  DOCTOR_PATTERN_MAX_LEN,
  DOCTOR_PATTERN_TOKEN_LABEL,
  DOCTOR_PATTERN_TOKENS,
  patternLabel,
  type DoctorPatternToken,
  type DoctorRuleParams,
  type DoctorSeverity,
} from '@duty/domain'
import { useState, useTransition } from 'react'
import { Field, btnPrimary, inputCls } from '@/components/admin/ui'
import { saveDoctorRulesAction } from '@/server/doctor/actions'
import { doctorRuleItems, patternText, ruleTagCls, type DoctorRuleItem } from './rule-items'

type NumKey = 'dPerMonth' | 'nPerMonth' | 'requestDeadlineDay' | 'negotiationEndDay'
const FIELDS: { key: NumKey; label: string; hint: string }[] = [
  {
    key: 'dPerMonth',
    label: '의사별 Day 개수 (30일 달)',
    hint: '날짜 수와 맞지 않는 만큼은 ±1 대상이 채웁니다',
  },
  { key: 'nPerMonth', label: '의사별 Night 개수 (30일 달)', hint: '31일 달은 한 명이 하나 더' },
  { key: 'requestDeadlineDay', label: '신청 마감일 (전월 며칠)', hint: '말일보다 크면 말일' },
  { key: 'negotiationEndDay', label: '조정 마감일 (전월 며칠)', hint: '그 전에 확정하면 조기 배포' },
]

function SeverityToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: DoctorSeverity
  onChange: (v: DoctorSeverity) => void
}) {
  const seg = (on: boolean, hard: boolean) =>
    `h-6 cursor-pointer rounded px-2 text-[11px] font-semibold ${
      on ? (hard ? 'bg-danger-bg text-danger-ink' : 'bg-warn-bg text-warn-ink') : 'text-ink-3 hover:text-ink'
    }`
  return (
    <span
      role="radiogroup"
      aria-label={`${label} 필수/권고`}
      className="flex shrink-0 rounded-md border border-line p-0.5"
    >
      {(['hard', 'soft'] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          className={seg(value === s, s === 'hard')}
          onClick={() => onChange(s)}
        >
          {s === 'hard' ? '필수' : '권고'}
        </button>
      ))}
    </span>
  )
}

export function DoctorRulesForm({ params, version }: { params: DoctorRuleParams; version: number }) {
  const [v, setV] = useState(params)
  const [draft, setDraft] = useState<DoctorPatternToken[]>(['N', 'D'])
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const setSeverity = (it: DoctorRuleItem, s: DoctorSeverity) => {
    const t = it.toggle
    if (!t) return
    if (t.kind === 'severity') setV({ ...v, severity: { ...v.severity, [t.key]: s } })
    else setV({ ...v, patterns: v.patterns.map((p, i) => (i === t.index ? { ...p, severity: s } : p)) })
  }
  const severityOf = (it: DoctorRuleItem): DoctorSeverity =>
    it.toggle?.kind === 'severity' ? v.severity[it.toggle.key] : v.patterns[it.toggle!.index]!.severity
  const draftKey = draft.join('-')
  const dup = v.patterns.some((p) => p.pattern.join('-') === draftKey)
  const onlyOff = draft.every((t) => t === 'O')

  return (
    <form
      className="grid items-start gap-5 text-[13px] lg:grid-cols-[460px_minmax(0,1fr)]"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await saveDoctorRulesAction({ params: v, baseVersion: version })
          setMsg(
            r.ok ? { ok: true, text: `저장했습니다 (규칙 v${r.version}).` } : { ok: false, text: r.message },
          )
        })
      }}
    >
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              type="number"
              min={1}
              max={31}
              className={inputCls}
              value={v[f.key]}
              onChange={(e) => setV({ ...v, [f.key]: Number(e.target.value) })}
            />
            <span className="text-xs font-normal text-ink-2">{f.hint}</span>
          </Field>
        ))}

        <section aria-label="금지 패턴" className="flex flex-col gap-2">
          <span className="font-semibold">금지 패턴</span>
          <span className="text-xs text-ink-2">
            한 의사가 연속한 날에 하는 근무 순서. D·N은 그 칸을 하는 날(올데이 포함), 올데이는 같은 날 D·N,
            O는 근무 없는 날. 목록에 없는 순서(예: N-O-D)는 허용됩니다
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {v.patterns.length === 0 && <li className="text-xs text-ink-3">없음</li>}
            {v.patterns.map((p, i) => {
              const label = patternLabel(p.pattern)
              const tag = p.severity === 'hard' ? '필수' : '권고'
              return (
                <li
                  key={p.pattern.join('-')}
                  title={patternText(p.pattern)}
                  className={`flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-semibold ${ruleTagCls(tag)}`}
                >
                  <span>{label}</span>
                  <button
                    type="button"
                    aria-label={`${label} ${tag} → ${tag === '필수' ? '권고' : '필수'}`}
                    className="cursor-pointer rounded px-1 text-[11px] underline-offset-2 hover:underline"
                    onClick={() =>
                      setV({
                        ...v,
                        patterns: v.patterns.map((x, j) =>
                          j === i ? { ...x, severity: x.severity === 'hard' ? 'soft' : 'hard' } : x,
                        ),
                      })
                    }
                  >
                    {tag}
                  </button>
                  <button
                    type="button"
                    aria-label={`${label} 삭제`}
                    className="cursor-pointer px-1 text-sm leading-none hover:text-danger"
                    onClick={() => setV({ ...v, patterns: v.patterns.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-panel p-2">
            {draft.map((t, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-ink-3">-</span>}
                <select
                  aria-label={`패턴 ${i + 1}일째`}
                  className="h-8 rounded-lg border border-line bg-surface px-1.5 text-xs"
                  value={t}
                  onChange={(e) =>
                    setDraft(draft.map((x, j) => (j === i ? (e.target.value as DoctorPatternToken) : x)))
                  }
                >
                  {DOCTOR_PATTERN_TOKENS.map((k) => (
                    <option key={k} value={k}>
                      {DOCTOR_PATTERN_TOKEN_LABEL[k]}
                    </option>
                  ))}
                </select>
              </span>
            ))}
            <button
              type="button"
              aria-label="패턴 하루 늘리기"
              disabled={draft.length >= DOCTOR_PATTERN_MAX_LEN}
              className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-2 text-xs disabled:opacity-40"
              onClick={() => setDraft([...draft, 'O'])}
            >
              +
            </button>
            <button
              type="button"
              aria-label="패턴 하루 줄이기"
              disabled={draft.length <= 2}
              className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-2 text-xs disabled:opacity-40"
              onClick={() => setDraft(draft.slice(0, -1))}
            >
              −
            </button>
            <button
              type="button"
              disabled={dup || onlyOff}
              title={dup ? '이미 있는 패턴입니다' : onlyOff ? 'O만으로 된 패턴은 쓸 수 없습니다' : undefined}
              className="ml-auto h-8 cursor-pointer rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-50"
              onClick={() => setV({ ...v, patterns: [...v.patterns, { pattern: draft, severity: 'hard' }] })}
            >
              패턴 추가
            </button>
          </div>
        </section>

        <label className="flex items-start gap-2 font-semibold">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={v.published}
            onChange={(e) => setV({ ...v, published: e.target.checked })}
          />
          <span>
            간호사에게 의사 근무표 공개
            <span className="block text-xs font-normal text-ink-2">
              끄면 테스트 기간 — 간호사 근무표의 「의사」 탭에 보이지 않습니다(의사 화면에는 「테스트 기간」
              표시)
            </span>
          </span>
        </label>
        <p className="text-xs text-ink-2">
          의사에게는 간호사의 16시간 휴식·연속 휴무 제한·연차가 없습니다. 금지 패턴은 위 목록만 적용합니다.
        </p>
        {msg && (
          <p role="status" className={msg.ok ? 'text-primary' : 'text-danger'}>
            {msg.text}
          </p>
        )}
        <button type="submit" className={btnPrimary} disabled={pending}>
          저장
        </button>
      </div>

      <section
        aria-label="규칙 안내"
        className="flex flex-col rounded-xl border border-line bg-surface lg:sticky lg:top-4"
      >
        <div className="border-b border-line-soft px-5 py-3">
          <h2 className="font-bold">규칙 안내</h2>
          <p className="text-xs text-ink-2">
            의사 규칙 안내 화면에 보이는 글입니다. 필수는 생성기가 반드시 지키고, 권고는 되도록 맞춥니다.
            저장하면 새 규칙 버전에 함께 들어갑니다.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-line-soft">
          {doctorRuleItems(v).map((it) => (
            <li key={it.id} className="flex items-start gap-3 px-5 py-3">
              <span className="w-24 shrink-0 font-bold">{it.title}</span>
              <span className="flex-1 text-ink-2">{it.body}</span>
              {it.toggle ? (
                <SeverityToggle
                  label={it.title}
                  value={severityOf(it)}
                  onChange={(s) => setSeverity(it, s)}
                />
              ) : (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ruleTagCls(it.tag)}`}
                >
                  {it.tag}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </form>
  )
}
