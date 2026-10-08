import { GuideSection, ShiftCards } from '@/components/rules-guide/GuideSection'
import { GuideToc } from '@/components/rules-guide/GuideToc'
import { requireUser } from '@/server/auth/guards'
import { getCurrentRules } from '@/server/rules'
import { buildRulesGuide } from '@/server/rules/guide'

// S7 규칙 안내 (Build Spec 2-10). 모든 수치는 현재 규칙 버전에서 렌더링한다
export default async function RulesGuidePage() {
  await requireUser()
  const { version, ...rules } = await getCurrentRules()
  const guide = buildRulesGuide(rules, version)
  return (
    <div className="grid min-w-0 gap-6 px-7 py-6 min-[900px]:grid-cols-[200px_1fr]">
      <GuideToc items={guide.sections.map((s) => ({ id: s.id, title: s.title }))} />
      <div className="flex min-w-0 flex-col gap-7">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-ink-2">규칙 안내</h1>
          <span className="ml-auto text-xs text-ink-3">
            {guide.version} · 규칙 설정에서 바뀌면 바로 반영됩니다
          </span>
        </div>
        {guide.sections.map((s, i) => (
          <GuideSection key={s.id} section={s}>
            {i === 0 && <ShiftCards shifts={guide.shifts} />}
          </GuideSection>
        ))}
      </div>
    </div>
  )
}
