'use client'

// 3-7a 의사 규칙 설정 — 의사별 D·N 개수(30일 달 기준), 신청 마감일·조정 마감일. 저장하면 새 규칙 버전
import type { DoctorRuleParams } from '@duty/domain'
import { useState, useTransition } from 'react'
import { Field, btnPrimary, inputCls } from '@/components/admin/ui'
import { saveDoctorRulesAction } from '@/server/doctor/actions'

const FIELDS: { key: keyof DoctorRuleParams; label: string; hint: string }[] = [
  {
    key: 'dPerMonth',
    label: '의사별 Day 개수 (30일 달)',
    hint: '날짜 수와 맞지 않는 만큼은 ±1 대상이 채웁니다',
  },
  { key: 'nPerMonth', label: '의사별 Night 개수 (30일 달)', hint: '31일 달은 한 명이 하나 더' },
  { key: 'requestDeadlineDay', label: '신청 마감일 (전월 며칠)', hint: '말일보다 크면 말일' },
  { key: 'negotiationEndDay', label: '조정 마감일 (전월 며칠)', hint: '그 전에 확정하면 조기 배포' },
]

export function DoctorRulesForm({ params, version }: { params: DoctorRuleParams; version: number }) {
  const [v, setV] = useState(params)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <form
      className="flex max-w-[460px] flex-col gap-4 rounded-xl border border-line bg-surface p-6 text-[13px]"
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
      <p className="text-xs text-ink-2">
        의사에게는 간호사의 금지 패턴·16시간 휴식·연속 휴무 제한·연차가 없습니다(N-O-D, 올데이-O-D 허용).
      </p>
      {msg && (
        <p role="status" className={msg.ok ? 'text-primary' : 'text-danger'}>
          {msg.text}
        </p>
      )}
      <button type="submit" className={btnPrimary} disabled={pending}>
        저장
      </button>
    </form>
  )
}
