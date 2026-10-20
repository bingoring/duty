import { doctorRuleItems, ruleTagCls } from '@/components/doctor/rule-items'
import { requireDoctor } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { currentDoctorRules } from '@/server/doctor/core'

// 3-7a 의사 규칙 안내 — 규칙 버전 값으로 렌더링. 3-11 6/7: 필수/권고·금지 패턴도 지금 규칙 버전에서 읽는다
export default async function DoctorRulesGuidePage() {
  await requireDoctor()
  const { version, params } = await currentDoctorRules(getDb())
  return (
    <div className="flex max-w-[760px] flex-col gap-4 px-7 py-6 text-[13.5px]">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">규칙 안내 · 의사</h1>
      <p className="text-xs text-ink-2">규칙 v{version}</p>
      <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-surface">
        {doctorRuleItems(params).map((it) => (
          <li key={it.id} className="flex items-start gap-3 px-5 py-3.5">
            <span className="w-24 shrink-0 font-bold">{it.title}</span>
            <span className="flex-1">{it.body}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ruleTagCls(it.tag)}`}
            >
              {it.tag}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
